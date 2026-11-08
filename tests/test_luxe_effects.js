/* Node checks for the Luxe profile effects (no browser). */
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
assert(Cos && Cos.effects, 'Cosmetics loads');

var luxe = Cos.effects.filter(function (e) { return e.tier === 'luxe'; });
function count(p) { return luxe.filter(function (e) { return e.price === p; }).length; }

assert.strictEqual(count(1000000000), 1, 'one 1B effect');
assert.strictEqual(count(100000000), 1, 'one 100M effect');
assert(count(1000000) >= 3, 'a set of 1M effects');
assert(count(100000) >= 3, 'a set of 100K effects');

var css = fs.readFileSync(path.join(root, 'assets/css/cosmetics-luxe.css'), 'utf8');
var ids = {};
luxe.forEach(function (e) {
  assert(!ids[e.id], 'unique id ' + e.id); ids[e.id] = 1;
  assert(!e.premium && !Cos.requiresPremium(e), e.name + ' does not need Premium');
  assert(!e.earn && !e.secret && !e.staff, e.name + ' is buyable');
  assert(e.price > 1600, e.name + ' is above the route-chest cap');
  [e].concat(e.also || []).forEach(function (g) {
    assert(new RegExp('\\.fx-' + g.shape + '\\b').test(css) ||
      /\.fx-(spark|ember|petal|drop)\b/.test('.fx-' + g.shape), e.name + ' shape ' + g.shape + ' is styled');
  });
  (e.layers || []).forEach(function (l) {
    assert(css.indexOf('.fxl-' + l) !== -1, e.name + ' layer ' + l + ' is styled');
  });
});

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(html.indexOf('assets/css/cosmetics-luxe.css') !== -1, 'index.html loads cosmetics-luxe.css');

console.log('luxe effects ok (' + luxe.length + ')');
