/* Node checks for the cosmetics glow-up (no browser). */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..');
var ctx = { window: {} };
ctx.global = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/cosmetics.js'), 'utf8'), ctx);
var Cos = ctx.window.Cosmetics;
assert(Cos && Cos.level && Cos.rarity && Cos.decoHtml && Cos.bannerScene && Cos.plateFx, 'helpers exported');

var css = ['app.css', 'cosmetics-extra.css', 'cosmetics-luxe.css', 'cosmetics-plus.css'].map(function (f) {
  return fs.readFileSync(path.join(root, 'assets/css', f), 'utf8');
}).join('\n');

/* every effect's layers, shapes and motions are styled */
Cos.effects.forEach(function (e) {
  (e.layers || []).forEach(function (l) {
    assert(css.indexOf('.fxl-' + l) !== -1, e.name + ' layer ' + l + ' is styled');
  });
  [e].concat(e.also || []).forEach(function (g) {
    if (!g.shape) return;
    assert(new RegExp('\\.fx-' + g.shape + '\\b').test(css), e.name + ' shape ' + g.shape + ' is styled');
    assert(css.indexOf('.fx-motion-' + (g.motion || 'fall')) !== -1, e.name + ' motion ' + g.motion + ' is styled');
  });
});

/* levels climb with price and never regress */
assert.strictEqual(Cos.level({ price: 0 }), 0);
assert.strictEqual(Cos.level({ price: 300 }), 1);
assert.strictEqual(Cos.level({ price: 700 }), 2);
assert.strictEqual(Cos.level({ price: 2000 }), 3);
assert.strictEqual(Cos.level({ price: 0, earn: 'secret', secret: 'x' }), 3);
assert.strictEqual(Cos.level({ price: 1e9, tier: 'luxe' }), 4);
assert.strictEqual(Cos.rarity({ price: 2000 }), 'legendary');
assert.strictEqual(Cos.rarity({ earn: 'secret', secret: 'x' }), 'secret');

/* every frame renders and every banner has a scene */
Cos.decorations.forEach(function (d) {
  var h = Cos.decoHtml(d);
  if (d.kind === 'none') return assert.strictEqual(h, '');
  assert(h.indexOf('--d1:' + d.c1) !== -1, d.name + ' frame carries its colour');
  if (d.kind === 'ring') assert(/ar--l\d/.test(h) && /ar__spin/.test(h), d.name + ' ring markup');
  if (d.kind === 'orbit') assert(/ao__c1/.test(h), d.name + ' orbit markup');
});
Cos.banners.forEach(function (b) {
  assert(/class="bnr bnr--/.test(Cos.bannerScene(b)), b.name + ' banner scene');
  if (b.id !== 'plain') assert(css.indexOf('.bnr--' + b.id + ' ') !== -1, b.name + ' banner scene is styled');
});
Cos.nameplates.forEach(function (n) {
  var f = Cos.plateFx(n);
  if (n.id === 'none') return assert.strictEqual(f.cls, '');
  assert(/np--l\d/.test(f.cls) && f.style.indexOf('--np-glow') !== -1, n.name + ' plate fx');
});

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(html.indexOf('assets/css/cosmetics-plus.css') !== -1, 'index.html loads cosmetics-plus.css');

console.log('cosmetics glow-up ok');
