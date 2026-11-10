#!/usr/bin/env node
/**
 * LEA-136 — Vibrant LearnGeo hub covers.
 * One shared saturated palette, original vectors, Inter + JetBrains Mono.
 * Not the LEA-104 cartoons and not the muted editorial plates.
 *
 * Run: node scripts/lea136-vibrant-covers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'img', 'games');

const INK = '#1A1033';
const PAPER = '#FFF6EA';
const CORAL = '#FF3D6E';
const AMBER = '#FFB703';
const LIME = '#C8F542';
const CYAN = '#19D3FF';
const VIOLET = '#7B3CFF';
const MAGENTA = '#FF2EC8';

const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

function cover(title, field, stripe, kicker, scene) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 644 296" width="644" height="296" role="img" aria-label="${title}">
  <!-- LEA-136 vibrant hub cover. Shared saturated palette. Original vector, not a sheet crop. -->
  <rect width="644" height="296" fill="${field}"/>
  ${scene}
  <rect x="0" y="208" width="644" height="88" fill="${INK}"/>
  <rect x="0" y="208" width="644" height="6" fill="${stripe}"/>
  <text x="28" y="264" font-family="${SANS}" font-size="36" font-weight="700" fill="${PAPER}" letter-spacing="-0.8">${title}</text>
  <text x="616" y="258" text-anchor="end" font-family="${MONO}" font-size="15" font-weight="600" fill="${stripe}" letter-spacing="1.8">${kicker}</text>
</svg>
`;
}

function text(x, y, body, opts = {}) {
  const {
    size = 18,
    fill = INK,
    anchor = 'middle',
    weight = 700,
    family = SANS,
    spacing = 0,
    opacity = 1
  } = opts;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${spacing}" opacity="${opacity}">${body}</text>`;
}

const covers = [];

covers.push(['duel', cover('Geo Duel', VIOLET, LIME, 'FIVE ROUNDS', `
  <polygon points="0,0 372,0 300,208 0,208" fill="${CORAL}"/>
  <polygon points="46,48 168,104 46,160" fill="${AMBER}"/>
  <polygon points="46,70 128,104 46,138" fill="${PAPER}"/>
  <polygon points="598,48 476,104 598,160" fill="${LIME}"/>
  <polygon points="598,70 516,104 598,138" fill="${PAPER}"/>
  <circle cx="322" cy="104" r="46" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
  ${text(322, 116, 'VS', { size: 32, fill: INK })}
`)]);

covers.push(['chess', cover('Geo Chess', MAGENTA, LIME, 'RATED', `
  <g stroke="${INK}" stroke-width="3">
    <rect x="150" y="16" width="86" height="86" fill="${PAPER}"/>
    <rect x="236" y="16" width="86" height="86" fill="${CORAL}"/>
    <rect x="322" y="16" width="86" height="86" fill="${PAPER}"/>
    <rect x="408" y="16" width="86" height="86" fill="${CORAL}"/>
    <rect x="150" y="102" width="86" height="86" fill="${CORAL}"/>
    <rect x="236" y="102" width="86" height="86" fill="${PAPER}"/>
    <rect x="322" y="102" width="86" height="86" fill="${CORAL}"/>
    <rect x="408" y="102" width="86" height="86" fill="${PAPER}"/>
  </g>
  <rect x="326" y="106" width="78" height="78" fill="none" stroke="${LIME}" stroke-width="5"/>
  <g transform="translate(158,24)">
    <path fill="${INK}" d="M8 74 H64 V62 H56 C60 50 56 40 44 36 L66 28 L56 14 L46 22 C46 12 36 4 26 10 C16 4 6 16 10 28 C2 34 2 48 12 56 L10 62 H8 Z"/>
    <circle cx="36" cy="22" r="3.5" fill="${LIME}"/>
  </g>
`)]);

covers.push(['dash', cover('Geo Dash', AMBER, CORAL, 'ONE BUTTON', `
  <g stroke="${VIOLET}" stroke-width="4" stroke-linecap="round" opacity="0.85">
    <line x1="28" y1="78" x2="92" y2="78"/>
    <line x1="40" y1="96" x2="92" y2="96"/>
    <line x1="56" y1="114" x2="92" y2="114"/>
  </g>
  <g transform="translate(124,64) rotate(-16)">
    <rect width="68" height="68" rx="10" fill="${CORAL}" stroke="${INK}" stroke-width="4"/>
    <rect x="16" y="16" width="36" height="36" rx="6" fill="${CYAN}"/>
  </g>
  <rect x="0" y="164" width="644" height="44" fill="${INK}"/>
  <polygon points="292,164 322,108 352,164" fill="${INK}"/>
  <polygon points="352,164 382,108 412,164" fill="${INK}"/>
  <polygon points="412,164 442,108 472,164" fill="${VIOLET}"/>
  <rect x="508" y="36" width="96" height="128" rx="10" fill="${VIOLET}" stroke="${INK}" stroke-width="4"/>
  ${text(556, 118, '?', { size: 72, fill: LIME })}
`)]);

covers.push(['orbit', cover('Globe Defender', INK, CYAN, 'ORBIT', `
  <circle cx="236" cy="104" r="120" fill="${VIOLET}" opacity="0.9"/>
  <circle cx="96" cy="36" r="4" fill="${PAPER}"/>
  <circle cx="150" cy="28" r="3" fill="${AMBER}"/>
  <circle cx="520" cy="34" r="4" fill="${LIME}"/>
  <circle cx="574" cy="70" r="3" fill="${PAPER}"/>
  <circle cx="48" cy="150" r="3" fill="${CYAN}"/>
  <circle cx="236" cy="104" r="74" fill="${CYAN}" stroke="${INK}" stroke-width="4"/>
  <path d="M186 86c18-16 40-8 48 10 6 14-4 24-16 22-18-2-28-18-22-34z" fill="${LIME}"/>
  <path d="M250 78c22-6 40 10 36 28-4 16-22 18-32 6-8-10-10-26-4-34z" fill="${LIME}"/>
  <ellipse cx="236" cy="104" rx="132" ry="42" fill="none" stroke="${PAPER}" stroke-width="4" transform="rotate(-18 236 104)"/>
  <rect x="360" y="98" width="56" height="8" rx="4" fill="${PAPER}"/>
  <polygon points="430,78 508,104 430,130" fill="${AMBER}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <rect x="414" y="96" width="22" height="16" rx="3" fill="${CORAL}"/>
  <circle cx="118" cy="46" r="14" fill="${CORAL}" stroke="${INK}" stroke-width="3"/>
  <circle cx="548" cy="156" r="18" fill="${MAGENTA}" stroke="${INK}" stroke-width="3"/>
`)]);

covers.push(['snake', cover('Capital Snake', CYAN, LIME, 'CAPITALS', `
  <g fill="${LIME}" stroke="${INK}" stroke-width="3">
    <rect x="28" y="124" width="48" height="48" rx="14"/>
    <rect x="64" y="124" width="48" height="48" rx="14"/>
    <rect x="100" y="124" width="48" height="48" rx="14"/>
    <rect x="136" y="124" width="48" height="48" rx="14"/>
    <rect x="136" y="88" width="48" height="48" rx="14"/>
    <rect x="172" y="88" width="48" height="48" rx="14"/>
    <rect x="208" y="88" width="48" height="48" rx="14"/>
  </g>
  <circle cx="242" cy="104" r="5" fill="${INK}"/>
  <circle cx="242" cy="120" r="5" fill="${INK}"/>
  <rect x="300" y="78" width="128" height="50" rx="25" fill="${CORAL}" stroke="${INK}" stroke-width="3"/>
  ${text(364, 110, 'OSLO', { size: 22, fill: PAPER })}
  <rect x="340" y="146" width="156" height="44" rx="22" fill="${AMBER}" stroke="${INK}" stroke-width="3"/>
  ${text(418, 175, 'KAMPALA', { size: 18, fill: INK })}
`)]);

covers.push(['golf', cover('Geo Golf', LIME, CORAL, 'PUTT', `
  <ellipse cx="168" cy="176" rx="150" ry="46" fill="${CYAN}"/>
  <circle cx="340" cy="150" r="30" fill="${AMBER}" stroke="${INK}" stroke-width="3"/>
  <circle cx="132" cy="118" r="14" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
  <path d="M150 112 C 230 28, 360 36, 456 96" fill="none" stroke="${CORAL}" stroke-width="5" stroke-dasharray="10 9" stroke-linecap="round"/>
  <line x1="468" y1="36" x2="468" y2="132" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  <polygon points="468,36 534,58 468,80" fill="${CORAL}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="468" cy="132" r="8" fill="${INK}"/>
`)]);

covers.push(['invaders', cover('Geo Invaders', VIOLET, AMBER, 'WAVES', `
  <g stroke="${INK}" stroke-width="3">
    <rect x="128" y="24" width="84" height="40" rx="12" fill="${PAPER}"/>
    <rect x="228" y="24" width="84" height="40" rx="12" fill="${CYAN}"/>
    <rect x="328" y="24" width="84" height="40" rx="12" fill="${PAPER}"/>
    <rect x="428" y="24" width="84" height="40" rx="12" fill="${PAPER}"/>
    <rect x="128" y="78" width="84" height="40" rx="12" fill="${PAPER}"/>
    <rect x="228" y="78" width="84" height="40" rx="12" fill="${PAPER}"/>
    <rect x="328" y="78" width="84" height="40" rx="12" fill="${AMBER}"/>
    <rect x="428" y="78" width="84" height="40" rx="12" fill="${PAPER}"/>
  </g>
  <g fill="${CORAL}">
    <circle cx="156" cy="44" r="5"/><circle cx="184" cy="44" r="5"/>
    <circle cx="256" cy="44" r="5"/><circle cx="284" cy="44" r="5"/>
    <circle cx="356" cy="44" r="5"/><circle cx="384" cy="44" r="5"/>
    <circle cx="456" cy="44" r="5"/><circle cx="484" cy="44" r="5"/>
    <circle cx="156" cy="98" r="5"/><circle cx="184" cy="98" r="5"/>
    <circle cx="256" cy="98" r="5"/><circle cx="284" cy="98" r="5"/>
    <circle cx="356" cy="98" r="5"/><circle cx="384" cy="98" r="5"/>
    <circle cx="456" cy="98" r="5"/><circle cx="484" cy="98" r="5"/>
  </g>
  <rect x="266" y="118" width="8" height="40" rx="4" fill="${CYAN}"/>
  <polygon points="230,176 310,176 270,138" fill="${AMBER}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <rect x="258" y="176" width="24" height="12" rx="3" fill="${AMBER}" stroke="${INK}" stroke-width="3"/>
`)]);

covers.push(['breakout', cover('Flag Breakout', CORAL, AMBER, 'BRICKS', `
  <g stroke="${INK}" stroke-width="3">
    <rect x="48" y="22" width="84" height="34" rx="4" fill="${AMBER}"/>
    <rect x="140" y="22" width="84" height="34" rx="4" fill="${LIME}"/>
    <rect x="232" y="22" width="84" height="34" rx="4" fill="${CYAN}"/>
    <rect x="324" y="22" width="84" height="34" rx="4" fill="${VIOLET}"/>
    <rect x="416" y="22" width="84" height="34" rx="4" fill="${PAPER}"/>
    <rect x="508" y="22" width="84" height="34" rx="4" fill="${MAGENTA}"/>
    <rect x="48" y="64" width="84" height="34" rx="4" fill="${VIOLET}"/>
    <rect x="140" y="64" width="84" height="34" rx="4" fill="${AMBER}"/>
    <rect x="232" y="64" width="84" height="34" rx="4" fill="${LIME}"/>
    <rect x="324" y="64" width="84" height="34" rx="4" fill="${CYAN}"/>
    <rect x="416" y="64" width="84" height="34" rx="4" fill="${MAGENTA}"/>
    <rect x="508" y="64" width="84" height="34" rx="4" fill="${PAPER}"/>
  </g>
  <circle cx="458" cy="39" r="11" fill="${VIOLET}"/>
  <rect x="412" y="18" width="92" height="42" fill="none" stroke="${LIME}" stroke-width="4" rx="6"/>
  <circle cx="300" cy="132" r="13" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
  <rect x="228" y="168" width="144" height="18" rx="9" fill="${AMBER}" stroke="${INK}" stroke-width="3"/>
`)]);

covers.push(['maze', cover('Capital Maze', MAGENTA, LIME, 'ROUTE', `
  <g fill="${INK}">
    <rect x="40" y="16" width="564" height="16"/>
    <rect x="40" y="176" width="564" height="16"/>
    <rect x="40" y="16" width="16" height="176"/>
    <rect x="588" y="16" width="16" height="176"/>
    <rect x="196" y="16" width="16" height="104"/>
    <rect x="360" y="84" width="16" height="108"/>
    <rect x="196" y="104" width="180" height="16"/>
    <rect x="80" y="78" width="80" height="16"/>
    <rect x="472" y="16" width="16" height="96"/>
  </g>
  <polyline points="92,52 176,52 176,142 332,142 332,52 452,52 452,142 552,142" fill="none" stroke="${CORAL}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="92" cy="52" r="12" fill="${CYAN}" stroke="${INK}" stroke-width="3"/>
  <rect x="536" y="126" width="32" height="32" rx="6" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
`)]);

covers.push(['typer', cover('Capital Typer', INK, AMBER, 'TYPE', `
  ${text(40, 58, 'JAPAN', { size: 18, fill: CYAN, anchor: 'start', weight: 600, family: MONO, spacing: 3 })}
  ${text(36, 148, 'TOK', { size: 92, fill: PAPER, anchor: 'start', spacing: -2 })}
  ${text(268, 148, 'Y', { size: 92, fill: AMBER, anchor: 'start', spacing: -2 })}
  <rect x="332" y="68" width="8" height="84" rx="2" fill="${LIME}"/>
  ${text(352, 148, 'O', { size: 92, fill: PAPER, anchor: 'start', spacing: -2, opacity: 0.28 })}
  <g stroke="${INK}" stroke-width="3">
    <rect x="500" y="36" width="96" height="44" rx="8" fill="${PAPER}"/>
    <rect x="500" y="90" width="96" height="44" rx="8" fill="${AMBER}"/>
    <rect x="500" y="144" width="96" height="44" rx="8" fill="${PAPER}"/>
  </g>
  ${text(548, 66, 'T', { size: 22, fill: INK, family: MONO, weight: 600 })}
  ${text(548, 120, 'Y', { size: 22, fill: INK, family: MONO, weight: 600 })}
  ${text(548, 174, 'O', { size: 22, fill: INK, family: MONO, weight: 600 })}
`)]);

covers.push(['crossing', cover('Border Crossing', MAGENTA, LIME, 'LANES', `
  <rect x="0" y="24" width="92" height="184" fill="${LIME}"/>
  <rect x="552" y="24" width="92" height="184" fill="${AMBER}"/>
  <rect x="92" y="24" width="460" height="184" fill="${INK}"/>
  <g stroke="${PAPER}" stroke-width="4" stroke-dasharray="16 14" opacity="0.85">
    <line x1="92" y1="86" x2="552" y2="86"/>
    <line x1="92" y1="148" x2="552" y2="148"/>
  </g>
  <g stroke="${INK}" stroke-width="3">
    <rect x="120" y="40" width="96" height="32" rx="8" fill="${CORAL}"/>
    <rect x="300" y="40" width="78" height="32" rx="8" fill="${AMBER}"/>
    <rect x="200" y="102" width="110" height="32" rx="8" fill="${CYAN}"/>
    <rect x="400" y="102" width="84" height="32" rx="8" fill="${PAPER}"/>
    <rect x="140" y="164" width="88" height="32" rx="8" fill="${VIOLET}"/>
    <rect x="340" y="164" width="100" height="32" rx="8" fill="${CORAL}"/>
  </g>
  <circle cx="478" cy="118" r="18" fill="${LIME}" stroke="${PAPER}" stroke-width="4"/>
  ${text(46, 122, 'GO', { size: 18, fill: INK, family: MONO, weight: 600, spacing: 1 })}
  ${text(598, 122, 'IN', { size: 18, fill: INK, family: MONO, weight: 600, spacing: 1 })}
`)]);

covers.push(['whack', cover('Capital Whack', CYAN, CORAL, 'TIMER', `
  <g fill="${INK}">
    <ellipse cx="108" cy="64" rx="40" ry="16"/>
    <ellipse cx="228" cy="64" rx="40" ry="16"/>
    <ellipse cx="348" cy="64" rx="40" ry="16"/>
    <ellipse cx="108" cy="156" rx="40" ry="16"/>
    <ellipse cx="228" cy="156" rx="40" ry="16"/>
    <ellipse cx="348" cy="156" rx="40" ry="16"/>
  </g>
  <g stroke="${INK}" stroke-width="3">
    <circle cx="228" cy="46" r="32" fill="${PAPER}"/>
    <circle cx="108" cy="132" r="32" fill="${AMBER}"/>
    <circle cx="348" cy="132" r="32" fill="${PAPER}"/>
  </g>
  <circle cx="228" cy="46" r="32" fill="none" stroke="${CORAL}" stroke-width="5"/>
  ${text(228, 52, 'OSLO', { size: 15, fill: INK })}
  ${text(108, 138, 'LIMA', { size: 15, fill: INK })}
  ${text(348, 138, 'RIGA', { size: 15, fill: INK })}
  <circle cx="520" cy="104" r="62" fill="none" stroke="${INK}" stroke-width="12"/>
  <circle cx="520" cy="104" r="62" fill="none" stroke="${LIME}" stroke-width="12" stroke-dasharray="250 390" transform="rotate(-90 520 104)" stroke-linecap="round"/>
  ${text(520, 112, '0:42', { size: 28, fill: INK, family: MONO, weight: 700 })}
`)]);

covers.push(['match', cover('Flag Match', AMBER, VIOLET, 'PAIRS', `
  <g stroke="${INK}" stroke-width="3">
    <rect x="36" y="28" width="132" height="160" rx="12" fill="${VIOLET}"/>
    <rect x="184" y="28" width="132" height="160" rx="12" fill="${PAPER}"/>
    <rect x="332" y="28" width="132" height="160" rx="12" fill="${PAPER}"/>
    <rect x="480" y="28" width="132" height="160" rx="12" fill="${VIOLET}"/>
  </g>
  <polygon points="102,78 132,108 102,138 72,108" fill="${LIME}"/>
  <polygon points="546,78 576,108 546,138 516,108" fill="${LIME}"/>
  <g>
    <rect x="204" y="68" width="92" height="24" fill="${CORAL}"/>
    <rect x="204" y="92" width="92" height="24" fill="${VIOLET}"/>
    <rect x="204" y="116" width="92" height="24" fill="${CYAN}"/>
    <rect x="352" y="68" width="92" height="24" fill="${CORAL}"/>
    <rect x="352" y="92" width="92" height="24" fill="${VIOLET}"/>
    <rect x="352" y="116" width="92" height="24" fill="${CYAN}"/>
  </g>
  <rect x="180" y="24" width="140" height="168" fill="none" stroke="${LIME}" stroke-width="5" rx="14"/>
  <rect x="328" y="24" width="140" height="168" fill="none" stroke="${LIME}" stroke-width="5" rx="14"/>
`)]);

covers.push(['sort', cover('Continent Sort', VIOLET, LIME, 'SIX BINS', `
  <rect x="36" y="22" width="128" height="44" rx="22" fill="${CORAL}" stroke="${INK}" stroke-width="3"/>
  ${text(100, 51, 'KENYA', { size: 18, fill: PAPER })}
  <path d="M100 70 v22" stroke="${LIME}" stroke-width="4"/>
  <polygon points="90,88 100,102 110,88" fill="${LIME}"/>
  <g stroke="${INK}" stroke-width="3" font-family="${SANS}">
    <rect x="28" y="112" width="90" height="80" rx="10" fill="${LIME}"/>
    <rect x="128" y="112" width="90" height="80" rx="10" fill="${INK}"/>
    <rect x="228" y="112" width="90" height="80" rx="10" fill="${INK}"/>
    <rect x="328" y="112" width="90" height="80" rx="10" fill="${INK}"/>
    <rect x="428" y="112" width="90" height="80" rx="10" fill="${INK}"/>
    <rect x="528" y="112" width="90" height="80" rx="10" fill="${INK}"/>
  </g>
  ${text(73, 150, 'AF', { size: 26, fill: INK })}
  ${text(73, 172, 'AFRICA', { size: 11, fill: INK, family: MONO, weight: 600, spacing: 0.6 })}
  ${text(173, 158, 'AS', { size: 26, fill: PAPER })}
  ${text(273, 158, 'EU', { size: 26, fill: PAPER })}
  ${text(373, 158, 'NA', { size: 26, fill: PAPER })}
  ${text(473, 158, 'SA', { size: 26, fill: PAPER })}
  ${text(573, 158, 'OC', { size: 26, fill: PAPER })}
`)]);

covers.push(['stack', cover('Capital Stack', LIME, VIOLET, 'COLUMNS', `
  <g fill="none" stroke="${INK}" stroke-width="3" opacity="0.4">
    <line x1="36" y1="28" x2="36" y2="186" stroke-dasharray="3 7"/>
    <line x1="172" y1="28" x2="172" y2="186" stroke-dasharray="3 7"/>
    <line x1="340" y1="28" x2="340" y2="186" stroke-dasharray="3 7"/>
    <line x1="476" y1="28" x2="476" y2="186" stroke-dasharray="3 7"/>
    <line x1="492" y1="28" x2="492" y2="186" stroke-dasharray="3 7"/>
    <line x1="628" y1="28" x2="628" y2="186" stroke-dasharray="3 7"/>
  </g>
  <g fill="none" stroke="${VIOLET}" stroke-width="4">
    <line x1="188" y1="28" x2="188" y2="186" stroke-dasharray="3 7"/>
    <line x1="324" y1="28" x2="324" y2="186" stroke-dasharray="3 7"/>
  </g>
  <line x1="36" y1="186" x2="628" y2="186" stroke="${INK}" stroke-width="4"/>
  <g stroke="${INK}" stroke-width="3">
    <rect x="188" y="36" width="136" height="34" rx="6" fill="${AMBER}"/>
    <rect x="36" y="148" width="136" height="34" rx="6" fill="${PAPER}"/>
    <rect x="36" y="110" width="136" height="34" rx="6" fill="${PAPER}"/>
    <rect x="340" y="148" width="136" height="34" rx="6" fill="${PAPER}"/>
    <rect x="340" y="110" width="136" height="34" rx="6" fill="${PAPER}"/>
    <rect x="340" y="72" width="136" height="34" rx="6" fill="${PAPER}"/>
    <rect x="492" y="148" width="136" height="34" rx="6" fill="${PAPER}"/>
  </g>
  ${text(256, 59, 'TOKYO', { size: 16, fill: INK })}
  ${text(104, 171, 'LYON', { size: 16, fill: INK })}
  ${text(104, 133, 'PARIS', { size: 16, fill: INK })}
  ${text(408, 171, 'NATAL', { size: 16, fill: INK })}
  ${text(408, 133, 'RECIFE', { size: 16, fill: INK })}
  ${text(408, 95, 'RIO', { size: 16, fill: INK })}
  ${text(560, 171, 'ASWAN', { size: 16, fill: INK })}
`)]);

covers.push(['echo', cover('Flag Echo', CORAL, CYAN, 'SEQUENCE', `
  <defs>
    <clipPath id="e1"><rect x="28" y="32" width="120" height="156" rx="14"/></clipPath>
    <clipPath id="e2"><rect x="164" y="32" width="120" height="156" rx="14"/></clipPath>
    <clipPath id="e3"><rect x="300" y="32" width="120" height="156" rx="14"/></clipPath>
    <clipPath id="e4"><rect x="436" y="32" width="120" height="156" rx="14"/></clipPath>
  </defs>
  <g clip-path="url(#e1)" stroke="${INK}" stroke-width="3">
    <rect x="28" y="32" width="120" height="78" fill="${AMBER}"/>
    <rect x="28" y="110" width="120" height="78" fill="${INK}"/>
  </g>
  <g clip-path="url(#e2)">
    <rect x="164" y="32" width="120" height="156" fill="${CYAN}"/>
    <rect x="214" y="32" width="22" height="156" fill="${LIME}"/>
  </g>
  <g clip-path="url(#e3)">
    <rect x="300" y="32" width="120" height="156" fill="${PAPER}"/>
    <circle cx="360" cy="110" r="34" fill="${VIOLET}"/>
  </g>
  <g clip-path="url(#e4)">
    <rect x="436" y="32" width="120" height="156" fill="${LIME}"/>
    <rect x="436" y="74" width="120" height="22" fill="${CORAL}"/>
    <rect x="436" y="118" width="120" height="22" fill="${CORAL}"/>
  </g>
  <g fill="none" stroke="${INK}" stroke-width="3">
    <rect x="28" y="32" width="120" height="156" rx="14"/>
    <rect x="164" y="32" width="120" height="156" rx="14"/>
    <rect x="300" y="32" width="120" height="156" rx="14"/>
    <rect x="436" y="32" width="120" height="156" rx="14"/>
  </g>
  <rect x="296" y="28" width="128" height="164" rx="16" fill="none" stroke="${CYAN}" stroke-width="5"/>
  <g fill="none" stroke="${PAPER}" stroke-width="5" stroke-linecap="round">
    <path d="M576 74 a26 26 0 0 1 0 60"/>
    <path d="M594 58 a44 44 0 0 1 0 92"/>
  </g>
  ${text(88, 78, '1', { size: 22, fill: INK, family: MONO, weight: 700 })}
  ${text(224, 78, '2', { size: 22, fill: INK, family: MONO, weight: 700 })}
  ${text(360, 78, '3', { size: 22, fill: VIOLET, family: MONO, weight: 700 })}
  ${text(496, 66, '4', { size: 22, fill: INK, family: MONO, weight: 700 })}
`)]);

for (const [id, svg] of covers) {
  fs.writeFileSync(path.join(OUT, id + '.svg'), svg);
  const png = path.join(OUT, id + '.png');
  if (fs.existsSync(png)) fs.unlinkSync(png);
}

console.log('wrote ' + covers.length + ' vibrant covers');
