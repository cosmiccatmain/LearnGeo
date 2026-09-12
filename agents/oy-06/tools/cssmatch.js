#!/usr/bin/env node
/* Two way check between the stylesheets oy-06 owns and the screens that
   render into them.

   Direction one, UNSTYLED: a class a screen emits with no rule. The column
   renders as nothing and it looks like broken CSS.
   Direction two, DEAD: a rule nothing emits. Harmless today, and the way a
   second naming convention creeps back in later.

   This is the automated version of the failure that cost this project a
   round: two files describing one interface in different words with nothing
   watching.

   Usage:
     node cssmatch.js --css a.css,b.css --js x.js,y.js [--quiet]

   Exit 1 if anything is unstyled. Dead rules are reported, never fatal:
   a rule can legitimately land before the markup that uses it. */

const fs = require('fs');

const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const cssFiles = (arg('--css') || '').split(',').filter(Boolean);
const jsFiles  = (arg('--js')  || '').split(',').filter(Boolean);
const quiet    = process.argv.includes('--quiet');
if (!cssFiles.length || !jsFiles.length) {
  console.error('usage: node cssmatch.js --css a.css[,b.css] --js x.js[,y.js]');
  process.exit(2);
}

/* ---- what the stylesheets actually define --------------------------------
   Comments are stripped FIRST. These files name classes in prose throughout,
   and a plain text search finds a class that was only ever discussed and
   counts it as styled. At-rule preludes are dropped per selector, never with
   one pass over a joined string: with no braces left in that string a greedy
   pattern runs to the end and eats every selector after the first @media,
   which reports a whole healthy file as broken. Both mistakes have been made
   here, in that order, within an hour. */
const defined = new Map();                     /* class -> which file */
for (const f of cssFiles) {
  const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@')) continue;
    for (const c of sel.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) {
      if (!defined.has(c[1])) defined.set(c[1], f);
    }
  }
}

/* ---- what the screens emit ---------------------------------------------- */
const emitted = new Map();                     /* class -> which file */
const ids = new Set();
const partial = new Set();                     /* 'gl-opt--' style prefixes */
const add = (c, f) => { if (!emitted.has(c)) emitted.set(c, f); };

for (const f of jsFiles) {
  /* JS comments go first. They are prose, so they contain apostrophes, and
     an apostrophe in "the teacher's screen" pairs with the next quote in the
     file and puts literal scanning out of phase for everything after it.
     That is not a small error: it silently drops whole regions and the tool
     then reports live classes as dead. */
  const src = fs.readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  /* Scan string LITERALS only, never the whole file: a class named in a JS
     comment is discussion, not markup, and counting it hides a real gap.
     Inside a literal, pull any token that looks like one of ours no matter
     what precedes it, because markup arrives as `class="gl-opt gl-opt--`
     with the attribute name glued to the first class and the last one cut
     off mid-word by a concatenation. A token left ending in a hyphen is a
     prefix, not a class: extraction can never see what gets appended, so it
     is reported for a human to read rather than guessed at. */
  /* ids are not classes. oy-04 wires its controls with id="gl-next" and
     querySelector('#gl-next'), and both look exactly like a class to a
     regex, so every button on the screen would be reported as an unstyled
     class and the real gaps would be buried in the noise. */
  for (const m of src.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);
  for (const m of src.matchAll(/id='([^']+)'/g)) ids.add(m[1]);
  for (const m of src.matchAll(/#([A-Za-z][A-Za-z0-9_-]*)/g)) ids.add(m[1]);

  const literals = [];
  for (const m of src.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)) literals.push(m[1]);
  for (const m of src.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) literals.push(m[1]);
  for (const lit of literals) {
    for (const m of lit.matchAll(/(?:^|[\s"'=])((?:gl|lb|clf)(?:-|__)[A-Za-z0-9_-]*)/g)) {
      const tok = m[1];
      if (tok.endsWith('-')) partial.add(tok); else add(tok, f);
    }
    for (const m of lit.matchAll(/(?:^|\s)(gl|lb|clf)(?=\s|$)/g)) add(m[1], f);
  }
}

/* Only classes this project owns are ours to answer for. app.css classes a
   screen borrows are someone else's rules and are not a gap here. */
const mine = c => /^(gl|lb|clf)(-|__)/.test(c) || c === 'gl' || c === 'lb' || c === 'clf';

const unstyled = [...emitted].filter(([c]) => mine(c) && !defined.has(c) && !ids.has(c));
const dead     = [...defined].filter(([c]) => mine(c) && !emitted.has(c) &&
                   ![...partial].some(p => c.startsWith(p)));

const short = p => p.replace(/^.*\/agents\//, '');
if (!quiet) {
  console.log('stylesheets: ' + cssFiles.map(short).join(', '));
  console.log('screens:     ' + jsFiles.map(short).join(', '));
  console.log('defined ' + [...defined].filter(([c]) => mine(c)).length +
              '   emitted ' + [...emitted].filter(([c]) => mine(c)).length);
}

if (unstyled.length) {
  console.log('\nUNSTYLED, a screen renders these and no rule matches:');
  unstyled.forEach(([c, f]) => console.log('  .' + c + '   ' + short(f)));
}
if (dead.length) {
  console.log('\nDEAD, a rule exists and nothing renders it:');
  dead.forEach(([c, f]) => console.log('  .' + c + '   ' + short(f)));
}
if (partial.size && !quiet) {
  console.log('\nBuilt by concatenation, check these by reading the line that\n' +
              'builds them; extraction only ever sees the prefix:');
  [...partial].sort().forEach(p => console.log('  .' + p + '…'));
}
if (!unstyled.length && !dead.length) console.log('\nboth directions clean');
process.exit(unstyled.length ? 1 : 0);
