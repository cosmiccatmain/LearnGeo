#!/usr/bin/env node
/* LEA-108: open Journey and assert XP card top == unit banner top. */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.LEA108_BASE || 'http://127.0.0.1:8766';
const OUT = process.env.LEA108_OUT ||
  '/cursor/stores/bc-419c48a8-ad8d-4774-a988-4922c3914ff5/media/lea-108-after.png';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.addInitScript(() => {
    try {
      localStorage.setItem('learngeo.save.v1', JSON.stringify({
        role: 'student',
        roleChosen: true,
        economy: { xp: 0, level: 1, diamonds: 150, xpToNext: 120 },
        roadtrip: {
          unitId: 'africa-north',
          done: {},
          claimed: {},
          read: {},
          xpEarned: 0,
          gemsEarned: 0
        },
        settings: { sound: false, effects: true }
      }));
    } catch (e) {}
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!(window.UI && window.RoadTripMode && window.WW), null, {
    timeout: 20000
  });

  await page.evaluate(() => {
    const W = window.WW;
    if (W && W.state) {
      W.state.role = 'student';
      W.state.roleChosen = true;
      if (!W.state.economy) W.state.economy = { xp: 0, level: 1, diamonds: 150 };
      if (!W.state.roadtrip) {
        W.state.roadtrip = {
          unitId: 'africa-north', done: {}, claimed: {}, read: {},
          xpEarned: 0, gemsEarned: 0
        };
      }
    }
    if (window.UI && window.UI.showApp) window.UI.showApp('roadtrip');
    else if (window.UI && window.UI.go) {
      document.getElementById('landing').classList.add('hidden');
      document.getElementById('app').classList.add('is-open');
      window.UI.go('roadtrip');
    }
  });

  await page.waitForSelector('.rtpath__headers .rt-xpchart', { timeout: 15000 });
  await page.waitForSelector('.rtpath__headers .rtpath__banner', { timeout: 10000 });
  await page.waitForTimeout(800);

  /* Dismiss overlays that might cover headers. */
  await page.evaluate(() => {
    document.querySelectorAll('.modal, .whats-new, #updates-modal').forEach((n) => {
      if (n && n.remove) n.remove();
    });
  });
  await page.waitForTimeout(200);

  const metrics = await page.evaluate(() => {
    const xp = document.querySelector('.rtpath__headers .rt-xpchart');
    const banner = document.querySelector('.rtpath__headers .rtpath__banner');
    const tip = document.querySelector('.rtnode__tip');
    if (!xp || !banner) return { ok: false, reason: 'missing nodes' };
    const a = xp.getBoundingClientRect();
    const b = banner.getBoundingClientRect();
    let tipGap = null;
    if (tip) {
      const tipBox = tip.getBoundingClientRect();
      const after = getComputedStyle(tip, '::after');
      tipGap = {
        tipPaddingRight: getComputedStyle(tip).paddingRight,
        afterMarginLeft: after.marginLeft,
        afterLeft: after.left,
        tipWidth: tipBox.width
      };
    }
    return {
      ok: true,
      xpTop: a.top,
      bannerTop: b.top,
      delta: Math.abs(a.top - b.top),
      xp: { top: a.top, left: a.left, width: a.width, height: a.height },
      banner: { top: b.top, left: b.left, width: b.width, height: b.height },
      sticky: getComputedStyle(xp).position,
      headersAlign: getComputedStyle(document.querySelector('.rtpath__headers')).alignItems,
      tipGap
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const headers = page.locator('.rtpath__headers');
  await headers.screenshot({ path: OUT });

  console.log(JSON.stringify(metrics, null, 2));
  console.log('screenshot:', OUT);

  await browser.close();

  if (!metrics.ok) {
    console.error('FAIL:', metrics.reason);
    process.exit(2);
  }
  if (metrics.delta > 1) {
    console.error('FAIL: tops not flush, delta=', metrics.delta);
    process.exit(1);
  }
  console.log('PASS: tops flush (delta <= 1px)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
