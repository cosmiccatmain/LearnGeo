(function (global) {
  'use strict';

  var paths = {
    portal: '/home',
    codex: '/codex',
    classroom: '/myclassroom',
    teacher: '/myclass',
    learn: '/learn',
    test: '/test',
    quiz: '/quiz',
    games: '/games'
  };
  var restoring = false;
  /* The address the app last recorded. A cancelled Back/Forward puts this
     back, query and hash included, because location has already moved on. */
  var currentUrl = '';
  /* Bumped on sign-out. Entries written before that must not open the app
     again: Back would otherwise return to a screen from the signed-in
     session. Kept in sessionStorage so a reload in this tab still knows. */
  var EPOCH_KEY = 'learngeo.historyEpoch';

  function readEpoch() {
    try {
      var n = parseInt(global.sessionStorage.getItem(EPOCH_KEY), 10);
      return n > 0 ? n : 0;
    } catch (e) { return 0; }
  }

  function storeEpoch() {
    try { global.sessionStorage.setItem(EPOCH_KEY, String(epoch)); } catch (e) {}
  }

  var epoch = readEpoch();

  function pathForView(view) {
    return Object.prototype.hasOwnProperty.call(paths, view) ? paths[view] : null;
  }

  function viewForPath(path) {
    path = path.replace(/\/+$/, '') || '/';
    return Object.keys(paths).find(function (view) { return paths[view] === path; }) || null;
  }

  function here() {
    return global.location.pathname + global.location.search + global.location.hash;
  }

  function stamp() { return { epoch: epoch }; }

  function write(method, url) {
    global.history[method](stamp(), '', url);
    currentUrl = url;
  }

  /* The document's first entry is not one record() wrote. Stamp it so a
     later sign-out can tell it apart from entries that predate the sign-out. */
  function claim() {
    var url = here();
    var state = global.history.state;
    currentUrl = url;
    if (state && state.epoch === epoch) return;
    write('replaceState', url);
  }

  function replace(url) {
    write('replaceState', url);
  }

  function record(view, opts) {
    var path = view ? pathForView(view) : '/';
    if (!path) throw new Error('Unknown app view: ' + view);
    var url = path + global.location.search + global.location.hash;
    if (url === here()) { currentUrl = url; return; }
    write(restoring || (opts && opts.history === 'replace') ? 'replaceState' : 'pushState', url);
  }

  /* Undo a popstate that the user declined, without dropping the run's own
     query string (record() would copy whatever location just changed to). */
  function stay() {
    if (!currentUrl || currentUrl === here()) return;
    write('pushState', currentUrl);
  }

  function invalidate() {
    epoch += 1;
    storeEpoch();
  }

  /* True when this entry was written before the latest sign-out. A missing
     stamp counts: only claim() and record() write the current epoch. */
  function staleHistory() {
    if (!epoch) return false;
    var state = global.history.state;
    var entry = state && typeof state.epoch === 'number' ? state.epoch : null;
    return entry !== epoch;
  }

  function restore() {
    var view = viewForPath(global.location.pathname);
    if (view && staleHistory()) {
      restoring = true;
      try {
        global.UI.closeModals();
        global.UI.showLanding({ history: 'replace' });
      } finally {
        restoring = false;
      }
      return;
    }
    if (global.UI && global.UI.blockHistoryLeave && global.UI.blockHistoryLeave(view)) return;
    restoring = true;
    try {
      global.UI.closeModals();
      if (view) global.UI.showApp(view, { history: 'replace', fromHistory: true });
      else global.UI.showLanding({ history: 'replace' });
    } finally {
      restoring = false;
    }
  }

  global.AppRouter = {
    pathForView: pathForView,
    viewForPath: viewForPath,
    record: record,
    restore: restore,
    claim: claim,
    replace: replace,
    stay: stay,
    invalidate: invalidate
  };
  global.addEventListener('popstate', restore);
})(window);
