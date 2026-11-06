/**
 * LEA-56 — two-browser Chess Duel invite → accept → in-match board.
 * Usage: node tools/lea56-chess-duel-demo.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const OUT = process.argv[3] || '/cursor/stores/self/media';
const stamp = String(Date.now()).slice(-5);
const HOST_TAG = 'Lea56H' + stamp;
const GUEST_TAG = 'Lea56G' + stamp;

fs.mkdirSync(OUT, { recursive: true });
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function deviceId() { return 'd' + crypto.randomBytes(12).toString('hex'); }

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '.overlay, .lg-update-overlay, .role-pick, .menu, .passkey-prompt, [data-passkey], .modal, .sheet'
    ).forEach((n) => n.remove());
    document.body.classList.remove('is-locked', 'has-overlay');
  });
}

async function openChessLobby(page) {
  await dismissOverlays(page);
  const card = page.locator('.game-card:has-text("Chess Duel")').first();
  await card.click({ force: true, timeout: 12000 });
  await sleep(700);
  await dismissOverlays(page);
  const play = page.locator('[data-play], button:has-text("Open chess lobby")').first();
  await play.click({ force: true, timeout: 10000 });
  await page.waitForSelector('#cduel-tag, .duel-lobby', { timeout: 15000 });
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
      localStorage.setItem('learngeo.updates.dismissedId', '2026-11-chess-duel');
    } catch (e) {}
  }, { tag, dev });

  const email = (tag.toLowerCase() + '@lea56.learngeo.test');
  const password = 'Lea56-demo-' + stamp + '!';

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.WW && window.Cloud && window.Cloud.sb),
    null,
    { timeout: 30000 }
  );
  await dismissOverlays(page);

  const auth = await page.evaluate(async ({ email, password, tag }) => {
    const sb = window.Cloud.sb;
    let res = await sb.auth.signUp({ email, password });
    if (res.error) {
      res = await sb.auth.signInWithPassword({ email, password });
    }
    if (res.error) return { ok: false, err: res.error.message };
    const W = window.WW;
    W.state.gamertag = tag;
    W.state.roleChosen = true;
    W.state.role = 'student';
    if (!W.state.deviceId || W.state.deviceId.length < 8) {
      const a = new Uint8Array(12); crypto.getRandomValues(a);
      let id = 'd';
      for (let i = 0; i < a.length; i++) id += ('0' + a[i].toString(16)).slice(-2);
      W.state.deviceId = id;
    }
    if (W.saveNow) W.saveNow(); else W.save();
    const claim = await sb.rpc('claim_gamertag', { p_device: W.state.deviceId, p_tag: tag });
    return {
      ok: claim.data === 'ok',
      data: claim.data,
      err: claim.error && claim.error.message,
      deviceId: W.state.deviceId,
      user: res.data && res.data.user && res.data.user.id
    };
  }, { email, password, tag });
  console.log('auth/claim', tag, auth);

  await page.goto(BASE + '/games', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.WW && window.Cloud && window.ChessDuel && window.Games && window.GameBoards),
    null,
    { timeout: 30000 }
  );
  await dismissOverlays(page);
  const claim = auth;

  await dismissOverlays(page);
  await openChessLobby(page);
  await sleep(600);
  return { ctx, page, tag, claim };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const host = await bootPlayer(browser, HOST_TAG);
  const guest = await bootPlayer(browser, GUEST_TAG);

  await dismissOverlays(host.page);
  await dismissOverlays(guest.page);
  await host.page.locator('#cduel-tag').fill(GUEST_TAG);
  await host.page.locator('[data-cduel-send]').click({ force: true });
  await host.page.waitForFunction(() => {
    const t = document.body.innerText || '';
    return /Waiting on |Invite sent|Invite pending/i.test(t);
  }, null, { timeout: 15000 });
  await sleep(800);
  await dismissOverlays(host.page);
  await host.page.screenshot({ path: path.join(OUT, 'lea56-host-invite-sent.png'), fullPage: false });

  await guest.page.evaluate(async () => {
    if (window.ChessDuel && window.ChessDuel.fetchInbox) await window.ChessDuel.fetchInbox();
  });
  await guest.page.waitForFunction(() => {
    return !!document.querySelector('[data-cduel-accept]') ||
      /wants a chess duel/i.test(document.body.innerText || '');
  }, null, { timeout: 20000 }).catch(async () => {
    await dismissOverlays(guest.page);
    await guest.page.evaluate(() => {
      const back = document.querySelector('[data-setup], .games__back, [data-hub]');
      if (back) back.click();
    });
    await sleep(500);
    await openChessLobby(guest.page);
    await sleep(1500);
  });

  await dismissOverlays(guest.page);
  await guest.page.screenshot({ path: path.join(OUT, 'lea56-guest-inbox.png'), fullPage: false });
  await guest.page.locator('[data-cduel-accept]').first().click({ force: true, timeout: 15000 });
  await sleep(2200);

  await host.page.waitForFunction(() => {
    const t = document.body.innerText || '';
    return /Your move|Waiting for |Chess Duel/i.test(t) && !!document.querySelector('.cduel-board, .chess-board');
  }, null, { timeout: 25000 });
  await sleep(1200);
  await host.page.screenshot({ path: path.join(OUT, 'lea56-host-in-match.png'), fullPage: false });
  await guest.page.screenshot({ path: path.join(OUT, 'lea56-guest-in-match.png'), fullPage: false });

  // Host plays e2e4
  const e2 = host.page.locator('.cduel-board [data-square="e2"]');
  const e4 = host.page.locator('.cduel-board [data-square="e4"]');
  if (await e2.count()) {
    await e2.click();
    await sleep(300);
    await e4.click();
    await sleep(1800);
  }
  await host.page.screenshot({ path: path.join(OUT, 'lea56-host-after-move.png'), fullPage: false });
  await guest.page.screenshot({ path: path.join(OUT, 'lea56-guest-after-move.png'), fullPage: false });

  const hostText = await host.page.evaluate(() => document.body.innerText);
  const guestText = await guest.page.evaluate(() => document.body.innerText);
  const okHost = /Your move|Waiting for |Chess Duel/i.test(hostText) && /cduel|chess/i.test(await host.page.content());
  const okGuest = /Your move|Waiting for |Chess Duel/i.test(guestText);

  const summary = {
    hostTag: HOST_TAG,
    guestTag: GUEST_TAG,
    okHost,
    okGuest,
    hostClaim: host.claim,
    guestClaim: guest.claim,
    hostSnippet: hostText.replace(/\s+/g, ' ').slice(0, 400),
    guestSnippet: guestText.replace(/\s+/g, ' ').slice(0, 400)
  };
  fs.writeFileSync(path.join(OUT, 'lea56-demo-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  await host.ctx.close();
  await guest.ctx.close();
  await browser.close();
  if (!okHost || !okGuest) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
