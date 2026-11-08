#!/usr/bin/env node
/**
 * LEA-104 — Brand-new LearnGeo hub cover art (SVG).
 * Crisp vector covers; NOT upscales or LEA-91 contact-sheet crops.
 *
 * Run: node scripts/lea104-generate-thumbs.mjs
 * Writes assets/img/games/{id}.svg and removes legacy .png crops.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'img', 'games');
const W = 644;
const H = 296;

const GAMES = [
  {
    id: 'duel',
    title: 'Geo Duel',
    accent: '#FF5A5F',
    accent2: '#3B82F6',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#152038"/>
          <stop offset="50%" stop-color="#0B1520"/>
          <stop offset="100%" stop-color="#1A1020"/>
        </linearGradient>
        <linearGradient id="lflag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F8FAFC"/><stop offset="50%" stop-color="#F8FAFC"/>
          <stop offset="50%" stop-color="#DC2626"/><stop offset="100%" stop-color="#DC2626"/>
        </linearGradient>
        <linearGradient id="rflag" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#009246"/><stop offset="33%" stop-color="#009246"/>
          <stop offset="33%" stop-color="#F8FAFC"/><stop offset="66%" stop-color="#F8FAFC"/>
          <stop offset="66%" stop-color="#CE2B37"/><stop offset="100%" stop-color="#CE2B37"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <path d="M0 0 L${W * 0.55} 0 L${W * 0.42} ${H} L0 ${H} Z" fill="#1B3A6B" opacity=".55"/>
      <path d="M${W * 0.45} 0 L${W} 0 L${W} ${H} L${W * 0.38} ${H} Z" fill="#6B1B2A" opacity=".5"/>
      <g transform="translate(150,78)">
        <rect x="-46" y="-34" width="92" height="68" rx="12" fill="#0B1520" stroke="#7CF3FF" stroke-width="3"/>
        <rect x="-38" y="-26" width="76" height="52" rx="6" fill="url(#lflag)"/>
      </g>
      <g transform="translate(494,78)">
        <rect x="-46" y="-34" width="92" height="68" rx="12" fill="#0B1520" stroke="#FF8A7A" stroke-width="3"/>
        <rect x="-38" y="-26" width="76" height="52" rx="6" fill="url(#rflag)"/>
      </g>
      <circle cx="322" cy="90" r="36" fill="#FFD23F" stroke="#0B1520" stroke-width="4"/>
      <text x="322" y="100" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        font-size="26" font-weight="800" fill="#0B1520" letter-spacing="1">VS</text>
    `
  },
  {
    id: 'chess',
    title: 'Geo Chess',
    accent: '#C4A574',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1A2438"/><stop offset="100%" stop-color="#0B1520"/>
        </linearGradient>
        <linearGradient id="knight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F8FAFC"/><stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <g opacity=".9">
        ${chessFloor()}
      </g>
      <ellipse cx="470" cy="210" rx="70" ry="16" fill="#0B1520" opacity=".35"/>
      <text x="470" y="205" text-anchor="middle"
        font-family="Georgia,'Times New Roman',serif" font-size="150" fill="url(#knight)"
        stroke="#0B1520" stroke-width="4" paint-order="stroke fill">♞</text>
      <circle cx="180" cy="70" r="8" fill="#FFD23F" opacity=".85"/>
      <circle cx="210" cy="54" r="5" fill="#7CF3FF" opacity=".7"/>
    `
  },
  {
    id: 'dash',
    title: 'Geo Dash',
    accent: '#FFD23F',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#1E3A8A"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect x="0" y="230" width="${W}" height="66" fill="#122047"/>
      <rect x="0" y="228" width="${W}" height="4" fill="#F8FAFC" opacity=".9"/>
      <g transform="translate(120,128) rotate(28)">
        <rect width="56" height="56" rx="6" fill="#FFD23F" stroke="#0B1520" stroke-width="4"/>
        <rect x="10" y="10" width="36" height="36" rx="3" fill="#1B4DFF"/>
      </g>
      ${spike(280, 230)} ${spike(320, 230)}
      <rect x="400" y="170" width="48" height="60" fill="#0B1520" stroke="#F8FAFC" stroke-width="3" rx="4"/>
      <g transform="translate(500,100)">
        <rect width="70" height="70" rx="10" fill="#0B1520" stroke="#FFD23F" stroke-width="4"/>
        <text x="35" y="48" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
          font-size="36" font-weight="800" fill="#FFD23F">?</text>
      </g>
    `
  },
  {
    id: 'orbit',
    title: 'Globe Defender',
    accent: '#7CF3FF',
    scene: `
      <defs>
        <radialGradient id="bg" cx="50%" cy="55%" r="70%">
          <stop offset="0%" stop-color="#163056"/><stop offset="100%" stop-color="#060A14"/>
        </radialGradient>
        <radialGradient id="globe" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#38BDF8"/><stop offset="55%" stop-color="#0C8F7F"/><stop offset="100%" stop-color="#0B3D4A"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${stars()}
      <ellipse cx="322" cy="148" rx="150" ry="48" fill="none" stroke="#7CF3FF" stroke-width="2.5" opacity=".55"
        transform="rotate(-18 322 148)"/>
      <circle cx="322" cy="148" r="78" fill="url(#globe)" stroke="#7CF3FF" stroke-width="3"/>
      <path d="M268 130 C290 118 310 160 340 148 C360 140 370 120 382 128" fill="none"
        stroke="#A7F3D0" stroke-width="8" stroke-linecap="round" opacity=".55"/>
      <g transform="translate(470,78)">
        <path d="M0 18 L34 0 L28 18 L34 36 Z" fill="#FFD23F" stroke="#0B1520" stroke-width="2"/>
        <rect x="28" y="14" width="18" height="8" rx="2" fill="#7CF3FF"/>
      </g>
      <circle cx="180" cy="70" r="10" fill="#F97316" opacity=".9"/>
      <circle cx="500" cy="200" r="14" fill="#94A3B8" opacity=".7"/>
      <circle cx="520" cy="210" r="7" fill="#CBD5E1" opacity=".5"/>
    `
  },
  {
    id: 'snake',
    title: 'Capital Snake',
    accent: '#22C55E',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0F2918"/><stop offset="100%" stop-color="#0B1520"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${grid('#166534', 0.18)}
      ${snakeSeg(90, 170)} ${snakeSeg(130, 170)} ${snakeSeg(170, 170)}
      ${snakeSeg(210, 170)} ${snakeSeg(210, 130)} ${snakeSeg(250, 130)}
      <rect x="282" y="110" width="44" height="44" rx="10" fill="#4ADE80" stroke="#0B1520" stroke-width="3"/>
      <circle cx="304" cy="128" r="5" fill="#0B1520"/>
      <circle cx="420" cy="130" r="16" fill="#EF4444" stroke="#FECACA" stroke-width="3"/>
      <g transform="translate(450,70)">
        <rect width="120" height="36" rx="18" fill="#0B1520" stroke="#FFD23F" stroke-width="2"/>
        <text x="60" y="24" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
          font-size="15" font-weight="700" fill="#EAF2FF">Nairobi</text>
      </g>
      <circle cx="160" cy="70" r="12" fill="#EF4444" opacity=".55"/>
    `
  },
  {
    id: 'golf',
    title: 'Geo Golf',
    accent: '#86EFAC',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1E3A5F"/><stop offset="100%" stop-color="#0B1520"/>
        </linearGradient>
        <linearGradient id="fairway" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22C55E"/><stop offset="100%" stop-color="#166534"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <ellipse cx="360" cy="210" rx="240" ry="70" fill="url(#fairway)" opacity=".95"/>
      <ellipse cx="200" cy="180" rx="90" ry="36" fill="#15803D" opacity=".7"/>
      <path d="M140 200 Q220 140 320 160 T480 120" fill="none" stroke="#F8FAFC" stroke-width="3"
        stroke-dasharray="8 10" opacity=".55"/>
      <circle cx="160" cy="188" r="12" fill="#F8FAFC" stroke="#0B1520" stroke-width="2"/>
      <g transform="translate(470,70)">
        <line x1="0" y1="0" x2="0" y2="110" stroke="#F8FAFC" stroke-width="3"/>
        <path d="M0 8 L48 22 L0 36 Z" fill="#EF4444"/>
        <ellipse cx="0" cy="112" rx="14" ry="5" fill="#0B1520" opacity=".45"/>
      </g>
      <g transform="translate(70,48)">
        <rect width="132" height="34" rx="17" fill="#0B1520" stroke="#86EFAC" stroke-width="2"/>
        <text x="66" y="23" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
          font-size="14" font-weight="700" fill="#EAF2FF">Putt to Kenya</text>
      </g>
    `
  },
  {
    id: 'invaders',
    title: 'Geo Invaders',
    accent: '#A78BFA',
    scene: `
      <defs>
        <radialGradient id="bg" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stop-color="#1E1B4B"/><stop offset="100%" stop-color="#050814"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${stars()}
      ${pod(110, 55)} ${pod(230, 40)} ${pod(350, 55)} ${pod(470, 40)}
      <rect x="318" y="150" width="6" height="40" fill="#7CF3FF" opacity=".9"/>
      <path d="M300 230 L322 198 L344 230 Z" fill="#FFD23F" stroke="#0B1520" stroke-width="2"/>
      <rect x="292" y="228" width="60" height="14" rx="4" fill="#1B4DFF" stroke="#7CF3FF" stroke-width="2"/>
    `
  },
  {
    id: 'breakout',
    title: 'Flag Breakout',
    accent: '#F59E0B',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1A2248"/><stop offset="100%" stop-color="#070A18"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${bricks()}
      <circle cx="360" cy="170" r="11" fill="#F8FAFC" stroke="#7CF3FF" stroke-width="3"/>
      <rect x="270" y="240" width="100" height="14" rx="7" fill="#7CF3FF" stroke="#0B1520" stroke-width="2"/>
    `
  },
  {
    id: 'maze',
    title: 'Capital Maze',
    accent: '#7CF3FF',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0A1230"/><stop offset="100%" stop-color="#05081C"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${mazeWalls()}
      <circle cx="150" cy="150" r="5" fill="#EAF2FF" opacity=".5"/>
      <circle cx="250" cy="90" r="5" fill="#EAF2FF" opacity=".5"/>
      <circle cx="400" cy="160" r="5" fill="#EAF2FF" opacity=".5"/>
      <circle cx="180" cy="200" r="16" fill="#7CF3FF" stroke="#0B1520" stroke-width="3"/>
      <path d="M188 192 L200 200 L188 208" fill="#0B1520"/>
      <g transform="translate(470,55)">
        <rect width="28" height="28" rx="8" fill="#FF9A3D"/>
        <circle cx="10" cy="11" r="3" fill="#0B1520"/><circle cx="20" cy="11" r="3" fill="#0B1520"/>
      </g>
      <g transform="translate(520,180)">
        <rect width="28" height="28" rx="8" fill="#F472B6"/>
        <circle cx="10" cy="11" r="3" fill="#0B1520"/><circle cx="20" cy="11" r="3" fill="#0B1520"/>
      </g>
      <g transform="translate(70,48)">
        <rect width="88" height="30" rx="15" fill="#0B1520" stroke="#FFD23F" stroke-width="2"/>
        <text x="44" y="21" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
          font-size="13" font-weight="700" fill="#EAF2FF">Paris</text>
      </g>
    `
  },
  {
    id: 'typer',
    title: 'Capital Typer',
    accent: '#60A5FA',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#12183A"/><stop offset="100%" stop-color="#04060F"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${wordPill(90, 50, 'France', false)}
      ${wordPill(280, 70, 'Japan', true)}
      ${wordPill(460, 45, 'Brazil', false)}
      ${wordPill(160, 120, 'Egypt', false)}
      ${wordPill(400, 130, 'Kenya', false)}
      <rect x="48" y="220" width="548" height="44" rx="10" fill="#0B1520" stroke="#7CF3FF" stroke-width="2.5"/>
      <text x="70" y="249" font-family="ui-monospace,SFMono-Regular,Menlo,monospace"
        font-size="20" font-weight="600" fill="#7CF3FF">tokyo_</text>
    `
  },
  {
    id: 'crossing',
    title: 'Border Crossing',
    accent: '#FBBF24',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0C1A33"/><stop offset="100%" stop-color="#071024"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${lane(70)} ${lane(110)} ${lane(150)} ${lane(190)} ${lane(230)}
      <rect x="80" y="118" width="56" height="22" rx="5" fill="#EF4444"/>
      <rect x="280" y="158" width="70" height="22" rx="5" fill="#3B82F6"/>
      <rect x="450" y="98" width="60" height="22" rx="5" fill="#F59E0B"/>
      <circle cx="200" cy="250" r="14" fill="#22C55E" stroke="#0B1520" stroke-width="3"/>
      ${gate(100, 28, 'A')} ${gate(230, 28, 'B')} ${gate(360, 28, 'C')} ${gate(490, 28, 'D')}
    `
  },
  {
    id: 'whack',
    title: 'Capital Whack',
    accent: '#F97316',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1A3324"/><stop offset="100%" stop-color="#10251A"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${hole(120, 70, true, 'it')} ${hole(280, 70, false)} ${hole(440, 70, false)}
      ${hole(120, 160, false)} ${hole(280, 160, true, 'jp')} ${hole(440, 160, false)}
      <g transform="translate(500,40)">
        <rect width="100" height="34" rx="17" fill="#0B1520" stroke="#FFD23F" stroke-width="2"/>
        <text x="50" y="23" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
          font-size="14" font-weight="700" fill="#FFD23F">0:42</text>
      </g>
    `
  },
  {
    id: 'match',
    title: 'Flag Match',
    accent: '#818CF8',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#151B3F"/><stop offset="100%" stop-color="#0C1130"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${tile(90, 55, false)} ${tile(210, 55, true, 'br')} ${tile(330, 55, false)} ${tile(450, 55, false)}
      ${tile(90, 145, true, 'Brazil')} ${tile(210, 145, false)} ${tile(330, 145, false)} ${tile(450, 145, true, 'jp')}
    `
  },
  {
    id: 'sort',
    title: 'Continent Sort',
    accent: '#2DD4BF',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#12203A"/><stop offset="100%" stop-color="#0A1024"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect x="40" y="70" width="564" height="36" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>
      <rect x="120" y="76" width="110" height="24" rx="6" fill="#0C8F7F"/>
      <text x="175" y="93" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        font-size="13" font-weight="700" fill="#F8FAFC">Kenya</text>
      <rect x="300" y="76" width="110" height="24" rx="6" fill="#1B4DFF" opacity=".85"/>
      <text x="355" y="93" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        font-size="13" font-weight="700" fill="#F8FAFC">Peru</text>
      ${bin(70, 'AF')} ${bin(160, 'AS')} ${bin(250, 'EU')} ${bin(340, 'NA')} ${bin(430, 'SA')} ${bin(520, 'OC')}
    `
  },
  {
    id: 'stack',
    title: 'Capital Stack',
    accent: '#FB7185',
    scene: `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1A1840"/><stop offset="100%" stop-color="#0B1030"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${col(90, 'France', ['Paris', 'Lyon'], 2)}
      ${col(230, 'Japan', ['Tokyo'], 1)}
      ${col(370, 'Brazil', ['Brasília', 'Rio', 'Salvador'], 3)}
      ${col(510, 'Egypt', [], 0)}
      <rect x="230" y="40" width="100" height="36" rx="8" fill="#FB7185" stroke="#0B1520" stroke-width="2"/>
      <text x="280" y="64" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        font-size="14" font-weight="700" fill="#0B1520">Tokyo</text>
    `
  },
  {
    id: 'echo',
    title: 'Flag Echo',
    accent: '#C084FC',
    scene: `
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#1A1640"/><stop offset="100%" stop-color="#080C22"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      ${pad(150, 70, '#EF4444', true)} ${pad(280, 70, '#3B82F6', false)} ${pad(410, 70, '#22C55E', false)}
      ${pad(150, 160, '#F59E0B', false)} ${pad(280, 160, '#A855F7', true)} ${pad(410, 160, '#06B6D4', false)}
      <text x="322" y="270" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        font-size="13" font-weight="600" fill="#C084FC" opacity=".9">Listen · repeat</text>
    `
  }
];

function chessFloor() {
  let out = '';
  const cols = 8, rows = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dark = (r + c) % 2 === 0;
      const y0 = 110 + r * 36;
      const perspective = 1 + r * 0.08;
      const x0 = 40 + c * (70 / perspective) + r * 8;
      const w = 68 / perspective;
      const h = 34;
      out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${dark ? '#5C4033' : '#D2B48C'}" opacity=".85"/>`;
    }
  }
  return out;
}

function spike(x, baseY) {
  return `<path d="M${x} ${baseY} L${x + 16} ${baseY - 36} L${x + 32} ${baseY} Z" fill="#F8FAFC" stroke="#0B1520" stroke-width="2"/>`;
}

function stars() {
  const pts = [[40, 40], [80, 90], [140, 30], [520, 50], [580, 100], [600, 40], [60, 200], [560, 220]];
  return pts.map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="${i % 2 ? 2 : 3}" fill="#EAF2FF" opacity="${0.35 + (i % 3) * 0.15}"/>`
  ).join('');
}

function grid(color, op) {
  let out = '';
  for (let x = 40; x < W; x += 40) out += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${color}" stroke-width="1" opacity="${op}"/>`;
  for (let y = 40; y < H; y += 40) out += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${color}" stroke-width="1" opacity="${op}"/>`;
  return out;
}

function snakeSeg(x, y) {
  return `<rect x="${x}" y="${y}" width="36" height="36" rx="8" fill="#22C55E" stroke="#0B1520" stroke-width="2.5"/>`;
}

function pod(x, y) {
  return `<g transform="translate(${x},${y})">
    <rect width="70" height="40" rx="8" fill="#16205A" stroke="#7CF3FF" stroke-width="2.5"/>
    <rect x="10" y="10" width="50" height="20" rx="4" fill="#7CF3FF" opacity=".35"/>
  </g>`;
}

function bricks() {
  const colors = ['#D7262B', '#1B4DFF', '#0E9F6E', '#F5B301', '#8B5CF6', '#22D3EE', '#F97316', '#EC4899'];
  let out = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const x = 48 + c * 68;
      const y = 36 + r * 36;
      const ring = r === 1 && c === 4;
      out += `<rect x="${x}" y="${y}" width="60" height="28" rx="4" fill="${colors[(r * 8 + c) % colors.length]}"
        stroke="${ring ? '#FFD23F' : '#0B1520'}" stroke-width="${ring ? 3.5 : 1.5}"/>`;
    }
  }
  return out;
}

function mazeWalls() {
  const walls = [
    [60, 40, 200, 18], [60, 40, 18, 120], [160, 100, 140, 18], [280, 40, 18, 160],
    [320, 100, 180, 18], [480, 40, 18, 120], [360, 180, 160, 18], [80, 200, 160, 18]
  ];
  return walls.map(([x, y, w, h]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#16205A" stroke="#7CF3FF" stroke-width="1.5" opacity=".9"/>`
  ).join('');
}

function wordPill(x, y, label, lit) {
  const w = 18 + label.length * 12;
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="36" rx="10" fill="${lit ? '#1B4DFF' : '#101840'}"
      stroke="${lit ? '#7CF3FF' : 'rgba(124,243,255,.45)'}" stroke-width="2"/>
    <text x="${w / 2}" y="24" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
      font-size="15" font-weight="700" fill="#EAF2FF">${label}</text>
  </g>`;
}

function lane(y) {
  return `<rect x="0" y="${y}" width="${W}" height="36" fill="${y % 80 === 70 ? '#0F1838' : '#0D1530'}"/>`;
}

function gate(x, y, label) {
  return `<g transform="translate(${x},${y})">
    <rect width="70" height="36" rx="6" fill="#0B1520" stroke="#FFD23F" stroke-width="2"/>
    <text x="35" y="24" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
      font-size="16" font-weight="800" fill="#FFD23F">${label}</text>
  </g>`;
}

function miniFlag(cx, cy, kind) {
  if (kind === 'it') {
    return `<g transform="translate(${cx - 18},${cy - 12})">
      <rect width="12" height="24" fill="#009246"/><rect x="12" width="12" height="24" fill="#F8FAFC"/>
      <rect x="24" width="12" height="24" fill="#CE2B37"/></g>`;
  }
  if (kind === 'jp') {
    return `<g transform="translate(${cx - 18},${cy - 12})">
      <rect width="36" height="24" fill="#F8FAFC"/><circle cx="18" cy="12" r="7" fill="#BC002D"/></g>`;
  }
  if (kind === 'br') {
    return `<g transform="translate(${cx - 18},${cy - 12})">
      <rect width="36" height="24" fill="#009B3A"/>
      <path d="M4 12 L18 4 L32 12 L18 20 Z" fill="#FFDF00"/>
      <circle cx="18" cy="12" r="5" fill="#002776"/></g>`;
  }
  return '';
}

function hole(x, y, up, flag) {
  let out = `<ellipse cx="${x + 40}" cy="${y + 55}" rx="40" ry="14" fill="#0B1520"/>`;
  if (up) {
    out += `<circle cx="${x + 40}" cy="${y + 28}" r="28" fill="#F8FAFC" stroke="#0C8F7F" stroke-width="3"/>`;
    if (flag) out += miniFlag(x + 40, y + 28, flag);
  } else {
    out += `<ellipse cx="${x + 40}" cy="${y + 52}" rx="28" ry="8" fill="#14532D"/>`;
  }
  return out;
}

function tile(x, y, face, label) {
  if (!face) {
    return `<rect x="${x}" y="${y}" width="100" height="78" rx="12" fill="#1B4DFF" stroke="#7CF3FF" stroke-width="2.5"/>
      <text x="${x + 50}" y="${y + 48}" text-anchor="middle" font-size="28" fill="#7CF3FF" opacity=".5">?</text>`;
  }
  const isFlagCode = label === 'br' || label === 'jp' || label === 'it';
  if (isFlagCode) {
    return `<rect x="${x}" y="${y}" width="100" height="78" rx="12" fill="#F8FAFC" stroke="#FFD23F" stroke-width="3"/>
      ${miniFlag(x + 50, y + 39, label)}`;
  }
  return `<rect x="${x}" y="${y}" width="100" height="78" rx="12" fill="#F8FAFC" stroke="#FFD23F" stroke-width="3"/>
    <text x="${x + 50}" y="${y + 46}" text-anchor="middle"
      font-family="system-ui,-apple-system,Segoe UI,sans-serif"
      font-size="16" font-weight="700" fill="#0B1520">${label || ''}</text>`;
}

function bin(x, label) {
  return `<g transform="translate(${x},150)">
    <rect width="70" height="90" rx="8" fill="#0B1520" stroke="#2DD4BF" stroke-width="2.5"/>
    <text x="35" y="52" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
      font-size="16" font-weight="800" fill="#2DD4BF">${label}</text>
  </g>`;
}

function col(x, header, blocks, n) {
  let out = `<g transform="translate(${x},70)">
    <rect width="100" height="32" rx="6" fill="#1B4DFF" stroke="#7CF3FF" stroke-width="2"/>
    <text x="50" y="22" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
      font-size="13" font-weight="700" fill="#F8FAFC">${header}</text>`;
  for (let i = 0; i < n; i++) {
    const by = 200 - i * 36;
    out += `<rect y="${by}" width="100" height="32" rx="6" fill="#334155" stroke="#94A3B8" stroke-width="1.5"/>
      <text x="50" y="${by + 21}" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        font-size="12" font-weight="600" fill="#EAF2FF">${blocks[i] || ''}</text>`;
  }
  out += `</g>`;
  return out;
}

function pad(x, y, color, lit) {
  return `<g transform="translate(${x},${y})">
    <rect width="90" height="70" rx="14" fill="${color}" opacity="${lit ? 1 : 0.45}"
      stroke="${lit ? '#F8FAFC' : 'rgba(255,255,255,.25)'}" stroke-width="${lit ? 4 : 2}"/>
    ${lit ? `<circle cx="45" cy="35" r="10" fill="#F8FAFC" opacity=".9"/>` : ''}
  </g>`;
}

function wrap(game) {
  const title = game.title;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}">
  <!-- LEA-104 brand-new LearnGeo hub cover — vector, not a sheet crop -->
  ${game.scene}
  <defs>
    <linearGradient id="titleFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B1520" stop-opacity="0"/>
      <stop offset="100%" stop-color="#0B1520" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${H - 88}" width="${W}" height="88" fill="url(#titleFade)"/>
  <text x="28" y="${H - 28}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    font-size="34" font-weight="800" fill="#FFFFFF" letter-spacing="-0.5">${title}</text>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });

for (const game of GAMES) {
  const svgPath = path.join(OUT, `${game.id}.svg`);
  fs.writeFileSync(svgPath, wrap(game));
  const pngPath = path.join(OUT, `${game.id}.png`);
  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
  console.log('wrote', path.relative(path.join(__dirname, '..'), svgPath));
}

console.log(`LEA-104: ${GAMES.length} SVG covers ready in ${OUT}`);
