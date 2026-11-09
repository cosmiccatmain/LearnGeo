/* Node checks for the juice layer (no browser). */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/juice.js'), 'utf8'), ctx);
var J = ctx.window.Juice;
assert(J && J.callout && J.parseCount && J.formatCount, 'helpers exported without a DOM');

/* streak shout-outs: each tier once, then every fifth past ten */
assert.strictEqual(J.callout(0), null);
assert.strictEqual(J.callout(2), null);
assert.strictEqual(J.callout(3).text, 'Nice!');
assert.strictEqual(J.callout(4), null);
assert.strictEqual(J.callout(5).text, 'Great!');
assert.strictEqual(J.callout(10).text, 'On fire!');
assert.strictEqual(J.callout(12), null);
assert.strictEqual(J.callout(15).text, 'Unstoppable!');
assert.strictEqual(J.callout(20).text, 'Unstoppable!');
assert.strictEqual(J.callout(25).tone, 'gold');
assert.strictEqual(J.callout(40).text, 'Legendary!');
assert.strictEqual(J.callout(41), null);

/* count-up parsing keeps the label and the exact final text */
var p = J.parseCount('1,907 m');
assert.deepStrictEqual([p.pre, p.n, p.post], ['', 1907, ' m']);
assert.strictEqual(J.formatCount(p, 1907), '1,907 m');
assert.strictEqual(J.formatCount(p, 0), '0 m');
assert.strictEqual(J.parseCount('3:21'), null, 'times are left alone');
assert.strictEqual(J.parseCount('1.5x'), null, 'decimals are left alone');
assert.strictEqual(J.parseCount('—'), null);
assert.strictEqual(J.parseCount('+42').n, 42);
assert.strictEqual(J.easeOut(0), 0);
assert.strictEqual(J.easeOut(1), 1);

/* wired in after the motion layer, and every fx class is styled */
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(html.indexOf('assets/css/juice.css') !== -1, 'juice.css linked');
assert(html.indexOf('assets/js/juice.js') > html.indexOf('assets/js/motion.js'), 'juice.js after motion.js');
var css = fs.readFileSync(path.join(root, 'assets/css/juice.css'), 'utf8');
['.jz-ring', '.jz-spark', '.jz-orb--xp', '.jz-orb--gem', '.jz-edge', '.jz-callout--gold', '.jz-rays', '.jz-lvl-tag',
 '.jz-hit', '.jz-lvl', '.jz-best', '.confetti-bit.is-ribbon', 'html:not(.jz-off)', 'prefers-reduced-motion: reduce'
].forEach(function (sel) { assert(css.indexOf(sel) !== -1, sel + ' is styled'); });

console.log('juice ok');
