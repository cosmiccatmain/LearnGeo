const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ui = fs.readFileSync(path.join(__dirname, '..', 'assets/js/ui.js'), 'utf8');

function tabDefs() {
  const start = ui.indexOf('var TAB_DEFS = [');
  assert.notEqual(start, -1, 'TAB_DEFS missing');
  const end = ui.indexOf('];', start);
  return ui.slice(start, end);
}

test('Games is a public shell tab after Class quiz, for every role', () => {
  const block = tabDefs();
  const games = block.indexOf("view: 'games'");
  const quiz = block.indexOf("view: 'quiz'");
  assert.ok(quiz !== -1 && games > quiz, 'Games should follow Class quiz');
  assert.match(block, /view:\s*'games',\s*icon:\s*'gamepad',\s*label:\s*'Games',\s*role:\s*null/);
  assert.doesNotMatch(block, /view:\s*'pets'/);
  assert.doesNotMatch(block, /not a public shell tab/);
});
