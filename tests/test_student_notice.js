/* One-time student notice: first show, no repeat after reload or a later
   login, a second account still sees it, and a signed-out browser does not.
   Uses the real save in core.js so the flag lands on the account key. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(root, 'assets/js/core.js'), 'utf8');
const noticeSrc = fs.readFileSync(path.join(root, 'assets/js/student-notice.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
const classSrc = fs.readFileSync(path.join(root, 'assets/js/classroom.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const NOTICE_ID = '2026-11-africa-all-countries-stream';
const MESSAGE = 'All countries are now in the stream.';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(k); }
  };
}

function createEl(tag) {
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    id: '',
    className: '',
    type: '',
    attrs: {},
    children: [],
    parentNode: null,
    listeners: {},
    textContent: '',
    innerHTML: ''
  };
  el.classList = {
    contains(name) { return el.className.split(/\s+/).indexOf(name) !== -1; },
    add(name) {
      if (!el.classList.contains(name)) el.className = (el.className + ' ' + name).trim();
    },
    remove(name) {
      el.className = el.className.split(/\s+/).filter(function (c) { return c && c !== name; }).join(' ');
    }
  };
  el.setAttribute = function (k, v) {
    el.attrs[k] = String(v);
    if (k === 'id') el.id = String(v);
    if (k === 'class') el.className = String(v);
  };
  el.getAttribute = function (k) {
    return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null;
  };
  el.appendChild = function (child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = el;
    el.children.push(child);
    return child;
  };
  el.insertBefore = function (child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = el;
    const i = ref ? el.children.indexOf(ref) : -1;
    if (i < 0) el.children.push(child);
    else el.children.splice(i, 0, child);
    return child;
  };
  el.removeChild = function (child) {
    const i = el.children.indexOf(child);
    if (i >= 0) el.children.splice(i, 1);
    child.parentNode = null;
    return child;
  };
  Object.defineProperty(el, 'nextSibling', {
    get() {
      if (!el.parentNode) return null;
      const i = el.parentNode.children.indexOf(el);
      return el.parentNode.children[i + 1] || null;
    }
  });
  el.addEventListener = function (type, fn) {
    (el.listeners[type] || (el.listeners[type] = [])).push(fn);
  };
  el.querySelector = function (sel) { return queryAll(el, sel)[0] || null; };
  return el;
}

function matches(el, sel) {
  const part = sel.trim();
  if (!part || part === '*') return true;
  if (part.charAt(0) === '.') return el.classList.contains(part.slice(1));
  if (part.charAt(0) === '#') return el.id === part.slice(1);
  return el.tagName === part.toUpperCase();
}

function queryAll(rootEl, sel) {
  const parts = String(sel || '').split(',');
  const out = [];
  function walk(el) {
    el.children.forEach(function (child) {
      if (parts.some(function (p) { return matches(child, p); })) out.push(child);
      walk(child);
    });
  }
  walk(rootEl);
  return out;
}

function createDocument() {
  const body = createEl('body');
  const app = createEl('div');
  app.id = 'app';
  app.className = 'app is-open';
  const header = createEl('header');
  header.className = 'topbar';
  const share = createEl('div');
  share.id = 'share-bar';
  share.className = 'share-bar';
  app.appendChild(header);
  app.appendChild(share);
  body.appendChild(app);

  const listeners = {};
  const document = {
    body: body,
    createElement: createEl,
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    dispatch(type, event) {
      (listeners[type] || []).forEach(function (fn) { fn(event); });
    },
    getElementById(id) {
      let found = null;
      function walk(el) {
        if (found) return;
        el.children.forEach(function (child) {
          if (child.id === id) found = child;
          else walk(child);
        });
      }
      walk(body);
      return found;
    },
    querySelector(sel) { return queryAll(body, sel)[0] || null; }
  };
  return document;
}

function boot(storage) {
  const document = createDocument();
  const sandbox = {
    localStorage: storage,
    document: document,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    Error: Error,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    console: console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(coreSrc, sandbox, { filename: 'core.js' });
  vm.runInNewContext(noticeSrc, sandbox, { filename: 'student-notice.js' });
  sandbox.Cloud = {
    signedIn: false,
    ready: false,
    status: 'off',
    user: null
  };
  return sandbox;
}

function enrolled(code, name) {
  return {
    code: code,
    className: name || 'this is a test.',
    name: 'Amina'
  };
}

function studentState(code) {
  const row = enrolled(code || 'DJZN4Y');
  return {
    role: 'student',
    roleChosen: true,
    profile: { displayName: 'Amina' },
    enrolments: [row],
    enrolled: row,
    flags: { premium: true }
  };
}

function signIn(ctx, id, state) {
  ctx.WW.useAccount(id);
  ctx.WW.replaceState(state);
  ctx.Cloud.signedIn = true;
  ctx.Cloud.ready = true;
  ctx.Cloud.status = 'synced';
  ctx.Cloud.user = { id: id };
}

function signOut(ctx) {
  ctx.Cloud.signedIn = false;
  ctx.Cloud.ready = false;
  ctx.Cloud.status = 'off';
  ctx.Cloud.user = null;
  ctx.WW.useAccount(null);
}

async function paint(ctx) {
  ctx.StudentNotice.sync();
  await new Promise(function (resolve) { setTimeout(resolve, 25); });
  return ctx.document.getElementById('student-notice');
}

function saved(storage, key) {
  const raw = storage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function noticeText(el) {
  if (!el) return '';
  const node = el.children.filter(function (c) { return c.id === 'student-notice-text'; })[0];
  return node ? node.textContent : '';
}

function dismissButton(el) {
  return el.children.filter(function (c) { return c.tagName === 'BUTTON'; })[0];
}

test('the page wires the notice without a stream post or a global flag', () => {
  assert.match(html, /assets\/js\/student-notice\.js/);
  assert.match(uiSrc, /function studentNoticeSync\(/);
  assert.ok(uiSrc.split('studentNoticeSync()').length >= 5, 'login, navigation, and dialog close ask');
  assert.match(classSrc, /StudentNotice\.sync/);
  assert.match(noticeSrc, /All countries are now in the stream\./);
  assert.match(noticeSrc, /DJZN4Y/);
  assert.match(noticeSrc, /flags\.notices/);
  assert.doesNotMatch(noticeSrc, /localStorage\s*\.|sessionStorage\s*\./);
  assert.doesNotMatch(noticeSrc, /postAnnouncement|from\('announcements'\)|mailto:|new Notification/);
  assert.doesNotMatch(noticeSrc, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.equal(MESSAGE, 'All countries are now in the stream.');
});

test('a signed-in student in the class sees it once, then not after reload or login', async () => {
  const storage = memoryStorage();
  const first = boot(storage);
  signIn(first, 'student-a', studentState());
  const el = await paint(first);
  assert.ok(el, 'first visit shows the notice');
  assert.equal(noticeText(el), MESSAGE);
  assert.equal(el.getAttribute('role'), 'region');
  assert.equal(el.getAttribute('aria-live'), 'polite');
  assert.equal(el.getAttribute('aria-labelledby'), 'student-notice-text');
  const btn = dismissButton(el);
  assert.equal(btn.getAttribute('aria-label'), 'Dismiss notice');
  assert.equal(btn.textContent, 'Got it');
  assert.equal(first.StudentNotice.hasSeen(), true);
  assert.equal(first.WW.state.flags.premium, true, 'other account flags stay');

  const blob = saved(storage, first.WW.userKey('student-a'));
  assert.equal(blob.flags.notices[NOTICE_ID], true);
  assert.equal(storage.getItem('learngeo.updates.dismissedId'), null);

  btn.listeners.click.forEach(function (fn) { fn({ type: 'click', target: btn }); });
  assert.equal(first.document.getElementById('student-notice'), null);

  const reloaded = boot(storage);
  reloaded.Cloud.signedIn = true;
  reloaded.Cloud.ready = true;
  reloaded.Cloud.status = 'synced';
  reloaded.Cloud.user = { id: 'student-a' };
  assert.equal(reloaded.WW.accountId(), 'student-a');
  assert.equal(await paint(reloaded), null, 'reload does not show it again');

  const again = boot(storage);
  signIn(again, 'student-a', saved(storage, again.WW.userKey('student-a')));
  assert.equal(await paint(again), null, 'a later login does not show it again');
});

test('switching accounts does not leak the seen flag, and logout shows nothing', async () => {
  const storage = memoryStorage();
  const ctx = boot(storage);
  signIn(ctx, 'student-a', studentState());
  assert.ok(await paint(ctx));
  const keyA = ctx.WW.userKey('student-a');
  const keyB = ctx.WW.userKey('student-b');
  assert.equal(saved(storage, keyA).flags.notices[NOTICE_ID], true);
  assert.equal(storage.getItem(keyB), null);

  signIn(ctx, 'student-b', studentState());
  const forB = await paint(ctx);
  assert.ok(forB, 'the other student still sees it the first time');
  assert.equal(noticeText(forB), MESSAGE);
  assert.equal(saved(storage, keyA).flags.notices[NOTICE_ID], true);
  assert.equal(saved(storage, keyB).flags.notices[NOTICE_ID], true);
  assert.notEqual(keyA, keyB);

  signIn(ctx, 'student-a', saved(storage, keyA));
  assert.equal(await paint(ctx), null, 'switching back does not show it');

  const guestBefore = storage.getItem(ctx.WW.GUEST_KEY);
  signOut(ctx);
  ctx.WW.replaceState(studentState());
  assert.equal(await paint(ctx), null, 'logged out, even with the class on the guest save');
  assert.equal(storage.getItem(ctx.WW.GUEST_KEY), guestBefore);
  const guest = saved(storage, ctx.WW.GUEST_KEY);
  if (guest) assert.equal(guest.flags && guest.flags.notices && guest.flags.notices[NOTICE_ID], undefined);
});

test('logged out, other classes, teachers, and a half-finished sign-in do not see or store it', async () => {
  const storage = memoryStorage();
  const ctx = boot(storage);

  ctx.WW.useAccount('student-a');
  ctx.WW.replaceState(studentState());
  ctx.Cloud.signedIn = false;
  ctx.Cloud.ready = false;
  ctx.Cloud.status = 'off';
  assert.equal(await paint(ctx), null, 'an account id without a session is logged out');
  assert.equal(storage.getItem(ctx.WW.userKey('student-a')), null);

  signIn(ctx, 'student-a', studentState('OTHER1'));
  assert.equal(await paint(ctx), null);
  assert.equal(ctx.StudentNotice.hasSeen(), false);

  signIn(ctx, 'student-a', studentState('djzn4y'));
  const lower = await paint(ctx);
  assert.ok(lower, 'the join code match is case-insensitive');
  assert.equal(noticeText(lower), MESSAGE);

  const both = studentState('OTHER1');
  both.enrolments.push(enrolled('DJZN4Y'));
  signIn(ctx, 'student-c', both);
  assert.ok(await paint(ctx), 'any enrolment in the class is enough');

  const teacher = studentState();
  teacher.role = 'teacher';
  signIn(ctx, 'teacher-oliver', teacher);
  assert.equal(await paint(ctx), null, 'the teacher does not get the student note');
  assert.equal(ctx.StudentNotice.hasSeen(), false);
  assert.equal(saved(storage, ctx.WW.userKey('teacher-oliver')), null);

  signIn(ctx, 'student-d', studentState());
  ctx.Masquerade = { active: true };
  assert.equal(await paint(ctx), null, 'a teacher preview is not a student login');
  assert.equal(ctx.StudentNotice.hasSeen(), false);
  ctx.Masquerade = { active: false };

  /* adopt() points storage at the new id before the profile arrives.
     The object still on screen is the previous student, who is in the
     class. That gap must not write their save, or the notice flag,
     under the new id. */
  signIn(ctx, 'student-prev', studentState());
  const keyE = ctx.WW.userKey('student-e');
  ctx.WW.useAccount('student-e');
  ctx.Cloud.signedIn = true;
  ctx.Cloud.ready = false;
  ctx.Cloud.status = 'syncing';
  ctx.Cloud.user = { id: 'student-e' };
  assert.equal(ctx.WW.state.enrolled.code, 'DJZN4Y');
  assert.equal(await paint(ctx), null, 'no notice while the account save is still in flight');
  assert.equal(storage.getItem(keyE), null, 'the in-flight account is not written');
  ctx.Cloud.signedIn = false;
  ctx.Cloud.status = 'off';
});

test('Escape and a dialog both dismiss without showing through the dialog', async () => {
  const storage = memoryStorage();
  const ctx = boot(storage);
  signIn(ctx, 'student-a', studentState());

  const cover = createEl('div');
  cover.className = 'overlay';
  ctx.document.body.appendChild(cover);
  assert.equal(await paint(ctx), null, 'a dialog already up holds the notice');
  assert.equal(ctx.StudentNotice.hasSeen(), false);

  cover.parentNode.removeChild(cover);
  const el = await paint(ctx);
  assert.ok(el);
  ctx.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(ctx.document.getElementById('student-notice'), null);
  assert.equal(ctx.StudentNotice.hasSeen(), true);
  assert.equal(await paint(ctx), null);
});
