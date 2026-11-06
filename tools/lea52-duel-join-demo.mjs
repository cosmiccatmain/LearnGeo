/**
 * LEA-52 — two-browser Geo Duel invite → accept → host auto-joins.
 * Usage: node tools/lea52-duel-join-demo.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const OUT = process.argv[3] || '/cursor/stores/self/media';
const stamp = String(Date.now()).slice(-5);
const HOST_TAG = 'Lea52H' + stamp;
const GUEST_TAG = 'Lea52G' + stamp;

fs.mkdirSync(OUT, { recursive: true });
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function deviceId() {
  return 'd' + crypto.randomBytes(12).toString('hex');
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.overlay, .lg-update-overlay, .role-pick, .menu').forEach((n) => n.remove());
  });
}

async function openDuelLobby(page) {
  await dismissOverlays(page);
  // Hub → Geo Duel setup → Open duel lobby
  const challenge = page.locator('.game-card:has-text("Geo Duel") .game-card__go, .game-card:has-text("Geo Duel")').first();
  await challenge.click({ force: true, timeout: 10000 });
  await sleep(700);
  await dismissOverlays(page);
  const play = page.locator('[data-play], button:has-text("Open duel lobby")').first();
  await play.click({ force: true, timeout: 10000 });
  await page.waitForSelector('#duel-tag, .duel-lobby', { timeout: 15000 });
}

async function bootPlayer(browser, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const dev = deviceId();

  await page.addInitScript(({ tag, dev }) => {
    const save = {
      version: 1,
      gamertag: tag,
      deviceId: dev,
      roleChosen: true,
      role: 'student',
      games: {},
      settings: { sound: false, effects: false },
      economy: { diamonds: 0, xp: 0, level: 1 },
      stats: { answered: 0, correct: 0, tests: 0, arcade: 0, perfectTests: 0 },
      mastery: {},
      skills: {},
      boardSent: {},
      achievements: [],
      secrets: {},
      classes: [],
      activeClassId: '',
      enrolments: [],
      enrolled: null,
      customSets: [],
      inbox: [],
      stream: [],
      streamSeen: 0,
      streak: { current: 0, best: 0 },
      daily: { date: '', answered: 0, goal: 20, dayStreak: 0, lastDay: '', lastHit: '', hit: false }
    };
    try {
      localStorage.setItem('learngeo.save.v1', JSON.stringify(save));
      localStorage.removeItem('learngeo.activeUser');
    } catch (e) {}
  }, { tag, dev });

  await page.goto(BASE + '/games', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.WW && window.Cloud && window.GeoDuel && window.Games && window.GameBoards), null, { timeout: 25000 });
  await dismissOverlays(page);

  const claim = await page.evaluate(async (name) => {
    const W = window.WW;
    W.state.gamertag = name;
    W.state.roleChosen = true;
    if (!W.state.deviceId || W.state.deviceId.length < 8) {
      const a = new Uint8Array(12); crypto.getRandomValues(a);
      let id = 'd';
      for (let i = 0; i < a.length; i++) id += ('0' + a[i].toString(16)).slice(-2);
      W.state.deviceId = id;
    }
    if (W.saveNow) W.saveNow(); else W.save();
    const sb = window.Cloud && window.Cloud.sb;
    if (!sb) return { ok: false, err: 'no-sb', deviceId: W.state.deviceId };
    const res = await sb.rpc('claim_gamertag', { p_device: W.state.deviceId, p_tag: name });
    return { ok: res.data === 'ok', data: res.data, err: res.error && res.error.message, deviceId: W.state.deviceId };
  }, tag);
  console.log('claim', tag, claim);

  await dismissOverlays(page);
  await openDuelLobby(page);
  await sleep(600);
  return { ctx, page, tag, claim };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const host = await bootPlayer(browser, HOST_TAG);
  const guest = await bootPlayer(browser, GUEST_TAG);

  await host.page.locator('#duel-tag').fill(GUEST_TAG);
  await host.page.locator('[data-duel-send]').click();
  await host.page.waitForFunction(() => {
    const t = document.body.innerText || '';
    return /Waiting on |Invite sent|Invite pending/i.test(t);
  }, null, { timeout: 15000 });
  await sleep(800);
  await host.page.screenshot({ path: path.join(OUT, 'lea52-host-invite-sent.png') });

  // Guest: refresh inbox via poll / remount lobby
  await guest.page.evaluate(async () => {
    if (window.GeoDuel && window.GeoDuel.fetchInbox) await window.GeoDuel.fetchInbox();
  });
  await guest.page.waitForFunction(() => {
    return !!document.querySelector('[data-duel-accept]') ||
      /wants to duel/i.test(document.body.innerText || '');
  }, null, { timeout: 20000 }).catch(async () => {
    // Force remount play screen
    await guest.page.evaluate(() => {
      const back = document.querySelector('[data-setup]');
      if (back) back.click();
    });
    await sleep(500);
    await guest.page.locator('[data-play], button:has-text("Open duel lobby")').first().click({ force: true });
    await sleep(1500);
  });

  await guest.page.screenshot({ path: path.join(OUT, 'lea52-guest-inbox.png') });
  await guest.page.locator('[data-duel-accept]').first().click({ timeout: 15000 });
  await sleep(2000);
  await guest.page.screenshot({ path: path.join(OUT, 'lea52-guest-accepted.png') });

  await host.page.waitForFunction(() => {
    const t = document.body.innerText || '';
    return /Building your question set|Round \d|Answer faster|Waiting for your opponent/i.test(t);
  }, null, { timeout: 25000 });
  await sleep(2500);
  await host.page.screenshot({ path: path.join(OUT, 'lea52-host-autojoined.png') });
  await guest.page.screenshot({ path: path.join(OUT, 'lea52-guest-in-match.png') });

  const hostText = await host.page.evaluate(() => document.body.innerText);
  const guestText = await guest.page.evaluate(() => document.body.innerText);
  const okHost = /Building your question set|Round \d|Answer faster|Waiting for your opponent/i.test(hostText);
  const okGuest = /Waiting for the host|Round \d|Answer faster|Waiting for your opponent|Building your question set/i.test(guestText);

  const summary = {
    hostTag: HOST_TAG,
    guestTag: GUEST_TAG,
    okHost,
    okGuest,
    hostClaim: host.claim,
    guestClaim: guest.claim,
    hostSnippet: hostText.replace(/\s+/g, ' ').slice(0, 360),
    guestSnippet: guestText.replace(/\s+/g, ' ').slice(0, 360)
  };
  fs.writeFileSync(path.join(OUT, 'lea52-demo-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  await host.ctx.close();
  await guest.ctx.close();
  await browser.close();
  if (!okHost || !okGuest) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
