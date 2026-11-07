/* LEA-63 / LEA-69: cooking loader helper + Admin Development preview. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('cooking-loader.js exposes html, host, overlay, and preview', () => {
  const src = read('assets/js/cooking-loader.js');
  assert.match(src, /global\.CookingLoader\s*=/);
  assert.match(src, /preview:\s*preview/);
  assert.match(src, /hidePreview/);
  assert.match(src, /cook-loader-preview/);
  assert.match(src, /data-cook-dismiss/);
  assert.match(src, /DEFAULT_CAPTION\s*=\s*'cooking'/);
});

test('cooking-loader.css styles the admin preview overlay', () => {
  const css = read('assets/css/cooking-loader.css');
  assert.match(css, /\.cook-loader-preview\b/);
  assert.match(css, /z-index:\s*196/);
  assert.match(css, /\.cook-loader-preview__dismiss/);
});

test('index.html loads cooking loader CSS and JS', () => {
  const html = read('index.html');
  assert.match(html, /cooking-loader\.css/);
  assert.match(html, /cooking-loader\.js/);
});

test('Administrator Development wires Preview cooking loader', () => {
  const admin = read('assets/js/administrator.js');
  assert.match(admin, /data-do="cookpreview"/);
  assert.match(admin, /Preview cooking loader/);
  assert.match(admin, /previewCookingLoader/);
  assert.match(admin, /CookingLoader\.preview|CL\.preview/);
  assert.match(admin, /cmd === 'cooking'/);
  assert.match(admin, /cmd === 'loader'/);
});
