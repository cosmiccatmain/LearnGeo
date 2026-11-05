/* Pet XP is earned and spent. Account level and shop diamonds are not a
   shortcut, and a refresh keeps the receipt.

   node tests/test_pets.js
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(root, 'assets/js/core.js'), 'utf8');
const petsSrc = fs.readFileSync(path.join(root, 'assets/js/pets.js'), 'utf8');
const petsCss = fs.readFileSync(path.join(root, 'assets/css/pets.css'), 'utf8');

function makeDocument() {
  const nodes = [];
  function walk(el, visit) {
    visit(el);
    (el.children || []).forEach(function (ch) { walk(ch, visit); });
  }
  function matches(el, sel) {
    sel = sel.trim();
    if (!sel) return false;
    if (sel.charAt(0) === '.') return el.classList.contains(sel.slice(1).split(/[\s\[]/)[0]);
    if (sel.charAt(0) === '#') return el.id === sel.slice(1);
    if (sel.charAt(0) === '[') {
      const m = sel.match(/^\[([^\]=~]+)(?:[~\^$*|]?=)?/);
      if (!m) return false;
      const key = m[1];
      return el.attrs && Object.prototype.hasOwnProperty.call(el.attrs, key);
    }
    return el.tagName === sel.toLowerCase();
  }
  function queryAll(rootEl, sel) {
    const parts = sel.split(',');
    const out = [];
    const start = rootEl ? [rootEl] : nodes.slice();
    start.forEach(function (top) {
      walk(top, function (el) {
        if (parts.some(function (p) { return matches(el, p); })) out.push(el);
      });
    });
    return out;
  }
  function El(tag) {
    this.tagName = tag || 'div';
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this._html = '';
    const self = this;
    this.classList = {
      contains: function (c) { return self._classes.indexOf(c) !== -1; },
      add: function (c) { if (!self.classList.contains(c)) self._classes.push(c); },
      remove: function (c) { self._classes = self._classes.filter(function (x) { return x !== c; }); },
      toggle: function (c, force) {
        const on = force === undefined ? !self.classList.contains(c) : !!force;
        if (on) self.classList.add(c); else self.classList.remove(c);
        return on;
      }
    };
    this._classes = [];
  }
  El.prototype = {
    get className() { return this._classes.join(' '); },
    set className(v) { this._classes = String(v || '').split(/\s+/).filter(Boolean); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v || ''); },
    setAttribute: function (k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
    },
    getAttribute: function (k) { return this.attrs[k]; },
    appendChild: function (ch) {
      ch.parentNode = this;
      this.children.push(ch);
      return ch;
    },
    removeChild: function (ch) {
      this.children = this.children.filter(function (c) { return c !== ch; });
      ch.parentNode = null;
    },
    addEventListener: function (type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    querySelector: function (sel) { return queryAll(this, sel)[0] || null; },
    querySelectorAll: function (sel) { return queryAll(this, sel); }
  };
  const body = new El('body');
  const doc = {
    body: body,
    createElement: function (tag) { return new El(tag); },
    getElementById: function (id) {
      let found = null;
      walk(body, function (el) { if (el.id === id) found = el; });
      return found;
    },
    querySelector: function (sel) { return queryAll(body, sel)[0] || null; },
    querySelectorAll: function (sel) { return queryAll(body, sel); }
  };
  return doc;
}

function boot(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  const document = opts.document || makeDocument();
  const sandbox = {
    console: console,
    localStorage: localStorage,
    document: document,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    matchMedia: function () { return { matches: !!opts.reduceMotion }; }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(coreSrc, sandbox, { filename: 'core.js' });
  vm.runInNewContext(petsSrc, sandbox, { filename: 'pets.js' });
  if (opts.prepare) opts.prepare(sandbox);
  return { sandbox: sandbox, store: store, document: document };
}

function firstPet(Pets) {
  const roster = Pets._ensureRoster();
  assert.ok(roster.owned.length >= 1);
  return roster.owned[0];
}

test('event popup sits below modals', () => {
  const block = petsCss.slice(petsCss.indexOf('.pets-event-overlay'), petsCss.indexOf('.pets-event-overlay') + 400);
  const z = block.match(/z-index:\s*(\d+)/);
  assert.ok(z, 'event overlay declares a z-index');
  assert.ok(Number(z[1]) < 200, 'event overlay must stay under .overlay (200), got ' + z[1]);
});

test('legacy roster migrates and is not reset to level 1', () => {
  const { sandbox } = boot({
    storage: {
      'learngeo.pets.roster.v0': JSON.stringify({
        owned: [{
          instanceId: 'keep-me',
          speciesId: 'ding-dong-jill',
          level: 6,
          xp: 12,
          mutationId: 'golden'
        }]
      })
    }
  });
  const pet = sandbox.Pets._ensureRoster().owned.find(function (p) { return p.instanceId === 'keep-me'; });
  assert.ok(pet);
  assert.equal(pet.level, 6);
  assert.equal(pet.xp, 12);
  assert.equal(pet.mutationId, 'golden');
  assert.equal(pet.skinStage, 'B');
  assert.equal(sandbox.Pets._ensureRoster().owned.length, 1);
});

test('upgrades spend earned pet XP and ignore a huge account balance', () => {
  const { sandbox } = boot();
  const WW = sandbox.WW;
  const Pets = sandbox.Pets;
  const pet = firstPet(Pets);
  WW.state.economy.diamonds = 2000000000;
  WW.state.economy.level = 9999;
  WW.state.economy.xp = 2000000000;
  Pets._setXpBank(0);
  const blocked = Pets.upgrade(pet.instanceId);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'xp');
  assert.equal(firstPet(Pets).level, 1);
  assert.equal(Pets._xpBank(), 0);
  const minted = Pets.grantXp(pet.instanceId, 999999);
  assert.equal(minted.ok, false);
  assert.equal(firstPet(Pets).level, 1);
  assert.equal(Pets._xpBank(), 0);

  const cost = Pets.xpToAdvance(1);
  Pets._setXpBank(cost - 1);
  assert.equal(Pets.upgrade(pet.instanceId).ok, false);
  assert.equal(firstPet(Pets).level, 1);
  assert.equal(Pets._xpBank(), cost - 1);

  Pets._setXpBank(cost);
  const paid = Pets.upgrade(pet.instanceId);
  assert.equal(paid.ok, true);
  assert.equal(paid.owned.level, 2);
  assert.equal(paid.owned.skinStage, 'A');
  assert.equal(Pets._xpBank(), 0);
  assert.equal(WW.state.economy.diamonds, 2000000000);
  assert.equal(WW.state.economy.level, 9999);
});

test('a reload keeps the spent bank and the new level', () => {
  const first = boot();
  const pet = firstPet(first.sandbox.Pets);
  const cost = first.sandbox.Pets.xpToAdvance(1);
  first.sandbox.Pets._setXpBank(cost);
  assert.equal(first.sandbox.Pets.upgrade(pet.instanceId).ok, true);
  const saved = JSON.parse(first.store['learngeo.save.v1']);
  assert.equal(saved.pets.xpBank, 0);
  assert.equal(saved.pets.owned[0].level, 2);

  const second = boot({ storage: { 'learngeo.save.v1': first.store['learngeo.save.v1'] } });
  const again = second.sandbox.Pets._ensureRoster().owned[0];
  assert.equal(again.level, 2);
  assert.equal(second.sandbox.Pets._xpBank(), 0);
  assert.equal(second.sandbox.Pets.upgrade(again.instanceId).ok, false);
  assert.equal(second.sandbox.Pets._ensureRoster().owned[0].level, 2);
});

test('correct answers add pet XP through award(), wrong answers do not', () => {
  const { sandbox } = boot();
  const WW = sandbox.WW;
  const Pets = sandbox.Pets;
  const pet = firstPet(Pets);
  WW.state.pets.care[pet.instanceId] = { hunger: 40, happiness: 45, at: Date.now() };
  const before = Pets._xpBank();
  const wrong = WW.award(false, { baseXp: 10 });
  assert.equal(wrong.petXp, undefined);
  assert.equal(Pets._xpBank(), before);
  const right = WW.award(true, { baseXp: 10 });
  assert.equal(right.petXp, Pets._PET_XP_BASE);
  assert.equal(Pets._xpBank(), before + Pets._PET_XP_BASE);
  assert.equal(WW.state.economy.level, 1);
});

test('a happy companion adds a small bonus, and crossing the cost levels them', () => {
  const { sandbox } = boot();
  const WW = sandbox.WW;
  const Pets = sandbox.Pets;
  const pet = firstPet(Pets);
  WW.state.pets.care[pet.instanceId] = { hunger: 90, happiness: 90, at: Date.now() };
  const gain = Pets.noteAnswer({ combo: 0 });
  const bonus = Math.max(1, Math.round(Pets._PET_XP_BASE * 0.25));
  assert.equal(gain.petXp, Pets._PET_XP_BASE + bonus);
  assert.equal(gain.bonus, bonus);

  Pets._setXpBank(Pets.xpToAdvance(1) - Pets._PET_XP_BASE);
  WW.state.pets.care[pet.instanceId] = { hunger: 40, happiness: 45, at: Date.now() };
  const leveled = Pets.noteAnswer({ combo: 0 });
  assert.equal(leveled.level, 2);
  assert.equal(Pets._ensureRoster().owned[0].level, 2);
  assert.equal(Pets._xpBank(), 0);
});

test('feeding spends shop diamonds and refuses an empty purse', () => {
  const { sandbox } = boot();
  const WW = sandbox.WW;
  const Pets = sandbox.Pets;
  const pet = firstPet(Pets);
  WW.state.economy.diamonds = 5;
  const broke = Pets.feed(pet.instanceId);
  assert.equal(broke.ok, false);
  assert.equal(broke.code, 'diamonds');
  assert.equal(WW.state.economy.diamonds, 5);
  const careBefore = JSON.stringify(WW.state.pets.care[pet.instanceId]);

  WW.state.economy.diamonds = Pets._FEED_COST;
  const fed = Pets.feed(pet.instanceId);
  assert.equal(fed.ok, true);
  assert.equal(fed.spent, Pets._FEED_COST);
  assert.equal(WW.state.economy.diamonds, 0);
  assert.ok(fed.care.hunger > JSON.parse(careBefore).hunger);
  assert.ok(fed.care.happiness > JSON.parse(careBefore).happiness);

  WW.state.economy.diamonds = 80;
  WW.state.pets.care[pet.instanceId] = { hunger: 100, happiness: 100, at: Date.now() };
  const full = Pets.feed(pet.instanceId);
  assert.equal(full.ok, false);
  assert.equal(full.code, 'full');
  assert.equal(WW.state.economy.diamonds, 80);
});

test('care decays over time and the pet stays', () => {
  const { sandbox } = boot();
  const Pets = sandbox.Pets;
  const pet = firstPet(Pets);
  sandbox.WW.state.pets.care[pet.instanceId] = {
    hunger: 82,
    happiness: 82,
    at: Date.now() - 10 * 3600000
  };
  const care = Pets.careFor(pet.instanceId);
  assert.equal(care.hunger, 40);
  assert.equal(care.happiness, 45);
  assert.equal(care.bonus, false);
  assert.equal(Pets._ensureRoster().owned[0].instanceId, pet.instanceId);
  assert.ok(Pets._ensureRoster().owned[0].level >= 1);
});

test('the event popup only opens for a student on Home, and navigation cancels the retry', () => {
  const document = makeDocument();
  const { sandbox } = boot({ document: document });
  const app = document.createElement('div');
  app.id = 'app';
  app.className = 'is-open';
  const portal = document.createElement('div');
  portal.id = 'view-portal';
  document.body.appendChild(app);
  document.body.appendChild(portal);

  const pending = [];
  sandbox.setTimeout = function (fn) {
    pending.push(fn);
    return pending.length;
  };
  sandbox.clearTimeout = function (id) { pending[id - 1] = null; };

  function flush() {
    const batch = pending.splice(0, pending.length);
    batch.forEach(function (fn) { if (fn) fn(); });
  }

  sandbox.WW.state.role = 'teacher';
  sandbox.Pets.maybeShowEventPopup();
  flush();
  assert.equal(document.querySelector('.pets-event-overlay'), null);

  sandbox.WW.state.role = 'student';
  const settings = document.createElement('div');
  settings.className = 'overlay';
  document.body.appendChild(settings);
  sandbox.Pets.maybeShowEventPopup();
  flush();
  flush();
  assert.equal(document.querySelector('.pets-event-overlay'), null);

  settings.parentNode.removeChild(settings);
  sandbox.Pets.maybeShowEventPopup();
  assert.equal(document.querySelector('.pets-event-overlay'), null);
  flush();
  assert.ok(document.querySelector('.pets-event-overlay'));

  portal.classList.add('hidden');
  sandbox.Pets.cancelEventPopup();
  assert.equal(document.querySelector('.pets-event-overlay'), null);
  sandbox.Pets.maybeShowEventPopup();
  flush();
  assert.equal(document.querySelector('.pets-event-overlay'), null);

  portal.classList.remove('hidden');
  sandbox.Pets.maybeShowEventPopup();
  sandbox.Pets.cancelEventPopup();
  flush();
  assert.equal(document.querySelector('.pets-event-overlay'), null);
});
