const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/router.js'), 'utf8');

function fixture(url = 'https://learngeo.example/') {
  const calls = [];
  const listeners = {};
  const window = {
    location: new URL(url),
    history: {},
    addEventListener: (name, fn) => { listeners[name] = fn; },
    UI: {
      closeModals: () => calls.push(['closeModals']),
      showApp: (view, opts) => {
        calls.push(['app', view]);
        window.AppRouter.record(view, opts);
      },
      showLanding: opts => {
        calls.push(['landing']);
        window.AppRouter.record(null, opts);
      }
    }
  };
  for (const method of ['pushState', 'replaceState']) {
    window.history[method] = (state, title, url) => {
      calls.push([method, url]);
      window.location = new URL(url, window.location);
    };
  }
  vm.runInNewContext(source, { window });
  return { window, calls, listeners, router: window.AppRouter };
}

test('all app routes match the deployed rewrites, including trailing slashes', () => {
  const { router } = fixture();
  const views = ['portal', 'codex', 'classroom', 'teacher', 'learn', 'test', 'quiz', 'games'];
  const rewrites = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'))).rewrites;
  assert.deepEqual(views.map(view => router.pathForView(view)).sort(),
    rewrites.map(entry => entry.source).sort());
  for (const view of views) {
    assert.equal(router.viewForPath(router.pathForView(view)), view);
    assert.equal(router.viewForPath(router.pathForView(view) + '/'), view);
  }
  assert.equal(router.viewForPath('/'), null);
  assert.equal(router.viewForPath('/index.html'), null);
  assert.equal(router.viewForPath('/not-a-route'), null);
});

test('view changes push history, repeated routes do not', () => {
  const { router, calls } = fixture();
  router.record('portal');
  router.record('games');
  router.record('games');
  router.record('classroom');
  router.record(null);
  assert.deepEqual(calls, [
    ['pushState', '/home'], ['pushState', '/games'],
    ['pushState', '/myclassroom'], ['pushState', '/']
  ]);
  assert.throws(() => router.record('invalid'), /Unknown app view/);
  assert.throws(() => router.record('constructor'), /Unknown app view/);
  assert.equal(router.pathForView('toString'), null);
});

test('initial links and role redirects replace rather than push history', () => {
  const { router, calls } = fixture('https://learngeo.example/myclassroom/');
  router.record('teacher', { history: 'replace' });
  assert.deepEqual(calls, [['replaceState', '/myclass']]);
});

test('history restores app and landing without adding entries', () => {
  const { window, calls, listeners } = fixture('https://learngeo.example/games');
  listeners.popstate();
  assert.deepEqual(calls, [['closeModals'], ['app', 'games']]);
  window.location = new URL('https://learngeo.example/');
  listeners.popstate();
  assert.deepEqual(calls.slice(2), [['closeModals'], ['landing']]);
});

test('authentication and other query/hash data survive route updates', () => {
  const { router, window } = fixture('https://learngeo.example/?code=example#recovery');
  router.record('portal', { history: 'replace' });
  assert.equal(window.location.href, 'https://learngeo.example/home?code=example#recovery');
});

test('modal close callbacks cannot push entries during history restoration', () => {
  const { router, window, calls } = fixture();
  window.UI.closeModals = () => router.record('portal');
  router.restore();
  assert.deepEqual(calls, [
    ['replaceState', '/home'], ['landing'], ['replaceState', '/']
  ]);
});
