const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadApp() {
  const window = {
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  };
  window.window = window;
  const context = { window, localStorage: window.localStorage };
  const root = path.resolve(__dirname, '..');
  ['assets/js/data.js', 'assets/js/core.js', 'assets/js/quiz.js'].forEach(function (file) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  });
  return window;
}

function byName(window, name) {
  return window.GeoData.countries.find(function (c) { return c.name === name; });
}

const app = loadApp();
const W = app.WW;
const Quiz = app.Quiz;
const eg = byName(app, 'Equatorial Guinea');
const sa = byName(app, 'South Africa');
const bolivia = byName(app, 'Bolivia');
const usa = byName(app, 'United States');

test('Equatorial Guinea capital is Ciudad de la Paz, with former names accepted', () => {
  assert.equal(eg.capital, 'Ciudad de la Paz');
  assert.ok(eg.lat > 1 && eg.lat < 2, 'pin is on the mainland city, not Malabo');
  assert.ok(eg.lon > 10 && eg.lon < 11);
  ['Ciudad de la Paz', 'Ciudad De La Paz', 'ciudad de la paz', 'Oyala', 'oyala', 'Djibloho'].forEach(function (answer) {
    assert.equal(W.matches(answer, eg.capital, eg.capitalAliases), true, answer);
  });
  assert.equal(W.matches('Malabo', eg.capital, eg.capitalAliases), false);
  assert.equal(W.matches('La Paz', eg.capital, eg.capitalAliases), false);
});

test('South Africa requires all three capitals, in any order', () => {
  assert.equal(sa.capital, 'Pretoria, Cape Town, Bloemfontein');
  assert.equal(sa.capitalAliases.length, 0);
  [
    'Pretoria, Cape Town, Bloemfontein',
    'Pretoria, Cape Town and Bloemfontein',
    'Pretoria, Cape Town & Bloemfontein',
    'Bloemfontein, Pretoria, Cape Town',
    'cape town / pretoria / bloemfontein',
    'CapeTown, Pretoria and Bloemfontein'
  ].forEach(function (answer) {
    assert.equal(W.matches(answer, sa.capital, sa.capitalAliases), true, answer);
  });
  ['Pretoria', 'Cape Town', 'Bloemfontein', 'Pretoria and Cape Town', 'Pretoria, Cape Town'].forEach(function (answer) {
    assert.equal(W.matches(answer, sa.capital, sa.capitalAliases), false, answer);
  });
});

test('typed and multiple-choice questions use the updated capitals', () => {
  const typed = Quiz.make('capital', sa, app.GeoData.countries, { typed: true });
  assert.equal(typed.typed, true);
  assert.equal(Quiz.grade(typed, 'Cape Town, Bloemfontein & Pretoria'), true);
  assert.equal(Quiz.grade(typed, 'Pretoria'), false);

  const choice = Quiz.make('capital', sa, app.GeoData.countries, { typed: false });
  const correct = choice.choices.filter(function (c) { return c.correct; });
  assert.equal(correct.length, 1);
  assert.equal(correct[0].text, sa.capital);
  assert.equal(Quiz.grade(choice, correct[0].text), true);
  assert.equal(Quiz.grade(choice, 'Pretoria'), false);
  assert.equal(choice.choices.some(function (c) { return c.text === 'Pretoria'; }), false);

  const egTyped = Quiz.make('capital', eg, app.GeoData.countries, { typed: true });
  assert.equal(Quiz.grade(egTyped, 'Oyala'), true);
  assert.equal(Quiz.grade(egTyped, 'Malabo'), false);
  const egChoice = Quiz.make('capital', eg, app.GeoData.countries, { typed: false });
  assert.equal(egChoice.choices.filter(function (c) { return c.correct; })[0].text, 'Ciudad de la Paz');
});

test('other multi-answer capitals still accept any one of them', () => {
  assert.equal(W.matches('Sucre', bolivia.capital, bolivia.capitalAliases), true);
  assert.equal(W.matches('La Paz', bolivia.capital, bolivia.capitalAliases), true);
  assert.equal(W.matches('Washington', usa.capital, usa.capitalAliases), true);
  assert.equal(W.matches('Washington, D.C.', usa.capital, usa.capitalAliases), true);
  assert.equal(W.matches('Washington DC', usa.capital, usa.capitalAliases), true);
});
