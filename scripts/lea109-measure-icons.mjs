#!/usr/bin/env node
/* Measure .gb__sec-mark letter ink vs tile center (LEA-109). */
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8765/tools/lea109-leaderboard-icons-preview.html';
const out = process.argv[3] || null;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });

const rows = await page.evaluate(() => {
  function inkBounds(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, right, top, bottom };
  }
  return [...document.querySelectorAll('.gb__sec-mark')].map((el) => {
    const box = el.getBoundingClientRect();
    const ink = inkBounds(el);
    const cs = getComputedStyle(el);
    if (!ink) return { letter: el.textContent.trim(), err: 'no ink' };
    return {
      letter: el.textContent.trim(),
      display: cs.display,
      fontSize: cs.fontSize,
      color: cs.color,
      dx: +((((ink.left + ink.right) / 2) - ((box.left + box.right) / 2)).toFixed(2)),
      dy: +((((ink.top + ink.bottom) / 2) - ((box.top + box.bottom) / 2)).toFixed(2)),
    };
  });
});

if (out) {
  await page.locator('.gb__sections').screenshot({ path: out });
}
console.log(JSON.stringify({ url, rows }, null, 2));
await browser.close();
