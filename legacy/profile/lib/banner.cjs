"use strict";
// Banner: typing text, name, badger constellation, golden snitch, and the special-day scenes.
// Every animation is plain SMIL inside the SVG, so GitHub renders it in a README <img>.

const { FONT, NS, esc, num, star, keyframes, createRandom, isDark } = require("./svg.cjs");

const CHAR_WIDTH = 11.6;
const SLOT_SECONDS = 7;
const NAME_X = 48;
const B_X = 269;
const B_WIDTH = 34;
const DOT_X = B_X + B_WIDTH + 3;

function constellation(T, mascot, tx = 772, ty = 118, scale = 0.55) {
  const color = T.gold;
  const parts = [`<g transform="translate(${tx},${ty}) scale(${scale})">`];
  for (const [a, b] of mascot.outline) {
    const [x1, y1] = mascot.points[a];
    const [x2, y2] = mascot.points[b];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="3 4"/>`);
  }
  for (const [a, b] of mascot.stripes) {
    const [x1, y1] = mascot.points[a];
    const [x2, y2] = mascot.points[b];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity=".85" stroke-width="1.8"/>`);
  }
  mascot.points.forEach(([x, y, r], i) => {
    const duration = 2.6 + (i % 5) * 0.7;
    parts.push(star(x, y, r + 2.8, color, color, 1, `<animate attributeName="opacity" values="1;.45;1" dur="${num(duration)}s" repeatCount="indefinite"/>`));
  });
  parts.push("</g>");
  return parts.join("");
}

// ---------- golden snitch ----------
function snitch(T, mode = "normal") {
  const gold = T.gold;
  const above = mode === "above";
  const motion = above
    ? { path: "M 585,75 C 650,28 700,100 760,56 C 810,30 860,70 806,96 C 764,112 690,30 620,70 C 600,80 592,78 585,75 Z", duration: "17s" }
    : { path: "M 585,205 C 650,110 700,225 760,120 C 810,55 868,150 806,202 C 764,238 690,64 620,150 C 600,172 590,190 585,205 Z", duration: "16s" };
  const wing = side => `<ellipse cx="${side * 6.5}" cy="-1.5" rx="6.5" ry="2.2" transform="rotate(${side * -22} ${side * 6.5} -1.5)" fill="#FFFFFF" fill-opacity=".9" stroke="${gold}" stroke-opacity=".7" stroke-width=".6">` +
    '<animate attributeName="ry" values="2.2;.5;2.2" dur=".22s" repeatCount="indefinite"/></ellipse>';
  const snow = mode === "snow"
    ? '<path d="M-4.4,-1.2 A4.4,4.4 0 0 1 4.4,-1.2 Q2,-3 0,-2 Q-2,-3.2 -4.4,-1.2 Z" fill="#FFFFFF"/>' +
      '<circle cx="-7" cy="-3.2" r="1.6" fill="#FFFFFF"/><circle cx="7.4" cy="-3.4" r="1.4" fill="#FFFFFF"/>'
    : "";
  return `<g><circle r="9" fill="${gold}" opacity=".22"/>${wing(-1)}${wing(1)}` +
    `<circle r="4" fill="${gold}" stroke="#FFFFFF" stroke-opacity=".7" stroke-width=".8"/>${snow}` +
    `<animateMotion dur="${motion.duration}" repeatCount="indefinite" path="${motion.path}"/></g>`;
}

// ---------- accessories ----------
const hatOnB = () => '<g><animateTransform attributeName="transform" type="rotate" values="-3 286 64;3 286 64;-3 286 64" dur="3s" repeatCount="indefinite"/>' +
  '<path d="M268,66 Q286,56 304,66 L298,39 Q292,32 284,40 Z" fill="#D62828"/>' +
  '<rect x="265" y="62" width="42" height="8" rx="4" fill="#FFFFFF"/><circle cx="298" cy="35" r="5" fill="#FFFFFF"/></g>';

const nameWord = T => `<text x="${NAME_X}" y="100" font-size="54" font-weight="700" fill="${T.fg}" textLength="205" lengthAdjust="spacingAndGlyphs">Florian</text>`;
const letterB = (T, fill = T.fg, extra = "") => `<text x="${B_X}" y="100" font-size="54" font-weight="700" fill="${fill}" textLength="${B_WIDTH}" lengthAdjust="spacingAndGlyphs"${extra}>B</text>`;
const dot = (T, animation = "") => `<g>${animation}<text x="${DOT_X}" y="100" font-size="54" font-weight="700" fill="${T.fg}" textLength="13" lengthAdjust="spacingAndGlyphs">.</text></g>`;

// Birthday scene: the B tips over, the dot rolls away, then the B stands up with a "+1".
function bFalling(T) {
  const rotation = '<animateTransform attributeName="transform" type="rotate" values="0 302 100;0 302 100;90 302 100;82 302 100;90 302 100;90 302 100;0 302 100;0 302 100" keyTimes="0;.4;.47;.5;.53;.88;.95;1" dur="12s" repeatCount="indefinite"/>';
  const roll = '<animateTransform attributeName="transform" type="translate" values="0,0;0,0;34,0;34,0;0,0;0,0" keyTimes="0;.47;.55;.9;.97;1" dur="12s" repeatCount="indefinite"/>';
  return `<g>${rotation}${letterB(T)}</g>${dot(T, roll)}` +
    `<text x="${B_X + 8}" y="60" font-size="20" font-weight="700" fill="${T.gold}" opacity="0">+1` +
    '<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.94;.95;.99;1" dur="12s" repeatCount="indefinite"/>' +
    '<animateTransform attributeName="transform" type="translate" values="0,14;0,14;0,14;0,-12;0,-16" keyTimes="0;.94;.95;.99;1" dur="12s" repeatCount="indefinite"/></text>';
}

const badgerSnow = () => '<path d="M800,141 Q806,127 827,125 Q848,127 854,141 Q846,135 840,140 Q834,133 827,139 Q820,133 814,140 Q808,135 800,141 Z" fill="#FFFFFF" opacity=".95"/>' +
  '<circle cx="796" cy="139" r="2.6" fill="#FFFFFF"/><circle cx="858" cy="139" r="2.6" fill="#FFFFFF"/>';

const snorkel = () => '<path d="M834,207 C852,215 886,202 884,160 L884,112" fill="none" stroke="#FFC857" stroke-width="3.4" stroke-linecap="round"/>' +
  '<path d="M834,207 C852,215 886,202 884,160 L884,112" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-dasharray="3 8" opacity=".8"/>' +
  '<circle cx="833" cy="207" r="3.8" fill="#FF7A59"/><rect x="879.5" y="103" width="10" height="9" rx="2.5" fill="#FF7A59"/>';

// ---------- Halloween: a bloody B with a knife through it ----------
const BLOOD = "#C1121F";

function bloodyB(T) {
  const drips = [[B_X + 6, 14, 0], [B_X + 16, 24, 1.4], [B_X + 27, 11, 2.6]];
  const runs = drips.map(([x, length, begin]) => {
    const values = `0;${length};${length};0`;
    const drop = `98;${98 + length};${98 + length};98`;
    return `<rect x="${x}" y="98" width="4" height="0" rx="2" fill="${BLOOD}"><animate attributeName="height" values="${values}" keyTimes="0;.45;.85;1" dur="6s" begin="${begin}s" repeatCount="indefinite"/></rect>` +
      `<circle cx="${x + 2}" cy="98" r="3" fill="${BLOOD}"><animate attributeName="cy" values="${drop}" keyTimes="0;.45;.85;1" dur="6s" begin="${begin}s" repeatCount="indefinite"/></circle>`;
  }).join("");
  const splatters = [[258, 74, 2], [312, 66, 2.4], [316, 92, 1.6], [262, 98, 1.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${BLOOD}"/>`).join("");
  return letterB(T, BLOOD, ' stroke="#6B0A12" stroke-width="1"') + runs + splatters;
}

// A kitchen knife stuck through the upper part of the B (steel blade, dark handle, blood at the entry).
function knife() {
  const parts = '<polygon points="-30,0 -22,-3.8 6,-3.8 6,3.8 -22,3.8" fill="#C9CDD6" stroke="#6B7280" stroke-width=".8"/>' +
    '<line x1="-26" y1="-1.2" x2="4" y2="-1.2" stroke="#FFFFFF" stroke-opacity=".7" stroke-width=".9"/>' +
    `<path d="M-12,-3.8 L0,-3.8 L0,3.8 L-8,3.8 Q-10,0 -12,-3.8 Z" fill="${BLOOD}" opacity=".85"/>` +
    '<rect x="6" y="-7" width="4" height="14" rx="1" fill="#3B2F2F"/>' +
    '<rect x="10" y="-4" width="24" height="8" rx="3" fill="#2B2B32"/>' +
    '<circle cx="16" cy="0" r="1.2" fill="#9AA0B5"/><circle cx="27" cy="0" r="1.2" fill="#9AA0B5"/>' +
    '<circle cx="36" cy="0" r="3.4" fill="#3B2F2F"/>';
  const wobble = '<animateTransform attributeName="transform" type="rotate" values="0 20 0;-2.5 20 0;0 20 0;1.8 20 0;0 20 0" dur="4.5s" repeatCount="indefinite"/>';
  const bead = `<circle cx="283" cy="82" r="2.4" fill="${BLOOD}"><animate attributeName="cy" values="80;98;98;80" keyTimes="0;.5;.85;1" dur="5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0;1" keyTimes="0;.5;.85;1" dur="5s" repeatCount="indefinite"/></circle>`;
  return `<g transform="translate(286,72) rotate(-35)"><g>${wobble}${parts}</g></g>${bead}`;
}

// ---------- overlays ----------
function overlaySnow(T, random) {
  const color = isDark(T) ? "#FFFFFF" : T.accent;
  let out = "";
  for (let i = 0; i < 30; i++) {
    const x = random.int(10, 890);
    const r = random.choice([1.2, 1.6, 2.0, 2.6]);
    const duration = random.uniform(6, 12);
    const begin = random.uniform(0, 8);
    out += `<circle cx="${x}" cy="-6" r="${r}" fill="${color}" opacity=".85"><animate attributeName="cy" from="-6" to="246" dur="${num(duration, 1)}s" begin="-${num(begin, 1)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cx" values="${x};${x + 9};${x - 7};${x}" dur="${num(duration / 2, 1)}s" begin="-${num(begin, 1)}s" repeatCount="indefinite"/></circle>`;
  }
  return out;
}

function overlayBats() {
  const bat = "M0,0 C-4,-5 -9,-4 -14,0 C-11,-1 -9,1 -7,4 C-5,2 -3,3 0,6 C3,3 5,2 7,4 C9,1 11,-1 14,0 C9,-4 4,-5 0,0 Z";
  return [[40, 9, 0], [95, 12, -4], [170, 10, -7]].map(([y0, duration, begin]) => {
    const path = `M 940,${y0} C 700,${y0 - 40} 500,${y0 + 40} -40,${y0 - 10}`;
    return `<g><g><path d="${bat}" fill="#0B0B10" stroke="#D9DCF0" stroke-opacity=".85" stroke-width=".9"/><circle cx="-2" cy="1" r=".9" fill="#FF3B3B"/><circle cx="2" cy="1" r=".9" fill="#FF3B3B"/>` +
      '<animateTransform attributeName="transform" type="scale" values="1 1;1 .35;1 1" dur=".35s" repeatCount="indefinite"/></g>' +
      `<animateMotion dur="${duration}s" begin="${begin}s" repeatCount="indefinite" path="${path}"/></g>`;
  }).join("");
}

function overlayConfetti(T, random) {
  const colors = isDark(T) ? ["#FF4FD8", "#3DF5FF", "#FFD166", "#7CFF6B", "#B388FF"] : ["#B80F8A", "#00868F", "#D99A00", "#2E9E3F", "#6A2BE0"];
  let out = "";
  for (let i = 0; i < 36; i++) {
    const x = random.int(10, 890);
    const duration = random.uniform(4.5, 8);
    const begin = random.uniform(0, 7);
    const color = random.choice(colors);
    const drift = random.int(-30, 30);
    const spin = random.choice([360, -360]);
    out += `<g><rect x="-3" y="-1.5" width="6" height="3" fill="${color}"><animateTransform attributeName="transform" type="rotate" from="0" to="${spin}" dur="${num(random.uniform(1, 2.2), 1)}s" repeatCount="indefinite"/></rect>` +
      `<animateTransform attributeName="transform" type="translate" from="${x},-10" to="${x + drift},250" dur="${num(duration, 1)}s" begin="-${num(begin, 1)}s" repeatCount="indefinite" additive="replace"/></g>`;
  }
  return out;
}

function overlayWater() {
  let wave = "M-100,128 q25,-9 50,0 t50,0";
  for (let i = 0; i < 10; i++) wave += " t50,0 t50,0";
  const bubbles = [[300, 3, 6, 0], [470, 2.2, 8, 3], [620, 3.4, 7, 5], [760, 2.4, 9, 2], [150, 2.6, 8, 1], [830, 2.4, 5, 2]]
    .map(([x, r, d, b]) => `<circle cx="${x}" cy="240" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity=".7"><animate attributeName="cy" from="246" to="132" dur="${d}s" repeatCount="indefinite" begin="-${b}s"/></circle>`).join("");
  const fish = '<g><ellipse rx="15" ry="7.5" fill="#FF7A59"/><polygon points="-13,0 -26,-8 -26,8" fill="#FF7A59"/><circle cx="7" cy="-2" r="2" fill="#fff"/><circle cx="7.6" cy="-2" r="1" fill="#14171C"/>' +
    '<animateMotion dur="12s" repeatCount="indefinite" path="M -40,180 C 200,150 420,215 700,165 S 880,200 960,170"/></g>';
  const slide = '<animateTransform attributeName="transform" type="translate" from="0,0" to="-100,0" dur="4s" repeatCount="indefinite"/>';
  return '<g clip-path="url(#frame)"><rect x="0" y="130" width="900" height="110" fill="#2B7BD6" opacity=".26"/>' +
    `<path d="${wave} L900,240 L-100,240 Z" fill="#2B7BD6" opacity=".18">${slide}</path>` +
    `<path d="${wave}" fill="none" stroke="#9FD0FF" stroke-opacity=".8" stroke-width="1.6">${slide}</path>${bubbles}${fish}</g>`;
}

function overlayPi(T, random) {
  const digits = "31415926535897932384626433832795";
  let out = "";
  for (let i = 0; i < 10; i++) {
    const x = 470 + i * 42;
    const duration = random.uniform(5, 9);
    const begin = random.uniform(0, 6);
    const start = random.int(0, 20);
    let spans = "";
    for (let k = 0; k < 10; k++) spans += `<tspan x="0" dy="17">${digits[(start + k) % digits.length]}</tspan>`;
    out += `<text font-family="Consolas,monospace" font-size="14" fill="${T.accent}" opacity=".5"><tspan x="0" dy="0"></tspan>${spans}` +
      `<animateTransform attributeName="transform" type="translate" from="${x},-190" to="${x},250" dur="${num(duration, 1)}s" begin="-${num(begin, 1)}s" repeatCount="indefinite"/></text>`;
  }
  return out;
}

// ---------- May 4th: purple saber (Mace Windu) against the red saber of the Sith ----------
// Accessibility: nothing may flash more than 3 times per second (WCAG 2.3.1), so the spark pulses slowly.
const SABER = { b: "#B26BFF", badger: "#FF2B2B" };
const HILT = { b: [457, 83], badger: [508, 90] };
const SABER_FRAMES = [[[521, 44], [452, 51]], [[532, 78], [448, 70]], [[508, 36], [462, 40]], [[535, 64], [452, 88]], [[515, 52], [445, 48]], [[521, 44], [452, 51]]];

function crossing([x1, y1], [x2, y2], [x3, y3], [x4, y4]) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-6) return [(x2 + x4) / 2, (y2 + y4) / 2];
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function saberFight() {
  const frameTimes = SABER_FRAMES.map((_, i) => num(i / (SABER_FRAMES.length - 1), 3)).join(";");
  const list = (frames, side, axis) => frames.map(frame => frame[side][axis]).join(";");
  const ignite = '<animate attributeName="stroke-dashoffset" values="1;1;0;0;1;1" keyTimes="0;.2;.27;.72;.78;1" dur="10s" repeatCount="indefinite"/>';
  const tips = (side, color, hilt) => {
    const xs = list(SABER_FRAMES, side, 0);
    const ys = list(SABER_FRAMES, side, 1);
    const moving = `<animate attributeName="x2" values="${xs}" keyTimes="${frameTimes}" dur="2.4s" repeatCount="indefinite"/><animate attributeName="y2" values="${ys}" keyTimes="${frameTimes}" dur="2.4s" repeatCount="indefinite"/>`;
    const base = `x1="${hilt[0]}" y1="${hilt[1]}" x2="${xs.split(";")[0]}" y2="${ys.split(";")[0]}" stroke-linecap="round" stroke-dasharray="1" pathLength="1" stroke-dashoffset="1"`;
    return `<line ${base} stroke="${color}" stroke-width="10" opacity=".6" filter="url(#blur)">${ignite}${moving}</line>` +
      `<line ${base} stroke="#FFFFFF" stroke-width="2.8">${ignite}${moving}</line>` +
      `<line ${base} stroke="${color}" stroke-width="1.2">${ignite}${moving}</line>`;
  };
  const hilt = ([x, y]) => `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.18;.22;.76;.8;1" dur="10s" repeatCount="indefinite"/>` +
    `<rect x="${x - 8}" y="${y - 3}" width="16" height="6" rx="2" fill="#9AA0B5" transform="rotate(-30 ${x} ${y})"/></g>`;
  const sparkPath = SABER_FRAMES.map(([b, g]) => crossing(HILT.b, b, HILT.badger, g).map(v => num(v, 1)).join(",")).join(";");
  const spark = '<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.2;.27;.72;.78;1" dur="10s" repeatCount="indefinite"/>' +
    `<g><animateTransform attributeName="transform" type="translate" values="${sparkPath}" keyTimes="${frameTimes}" dur="2.4s" repeatCount="indefinite"/>` +
    '<circle r="10" fill="#FFFFFF" opacity=".4"><animate attributeName="opacity" values=".15;.55;.15" dur=".8s" repeatCount="indefinite"/></circle>' +
    star(0, 0, 9, "#FFFFFF", "#FFD27A", 1, '<animate attributeName="opacity" values="1;.4;1" dur=".7s" repeatCount="indefinite"/>') + "</g></g>";
  return hilt(HILT.b) + tips(0, SABER.b, HILT.b) + hilt(HILT.badger) + tips(1, SABER.badger, HILT.badger) + spark;
}

// Scenes: what changes on a given day. Texts come from profile.json (scenePhrases).
const SCENES = {
  noel: { hat: true, badgerSnow: true, snitch: "snow", overlays: ["snow"] },
  halloween: { bloody: true, knife: true, overlays: ["bats"] },
  anniv: { fall: true, overlays: ["confetti"] },
  avril: { snitch: "above", water: true, snorkel: true },
  mai4: { fight: true },
  pi: { overlays: ["pi"] },
};
const SCENE_SEEDS = { snow: 3, confetti: 7, pi: 5 };
const OVERLAYS = { snow: overlaySnow, bats: overlayBats, confetti: overlayConfetti, pi: overlayPi };

function phrasesFor(i18n, scene) {
  const base = i18n.phrases;
  const extra = i18n.scenePhrases?.[scene];
  if (!extra) return base;
  return i18n.sceneMode[scene] === "replace" ? extra : [...extra, ...base];
}

function banner(T, i18n, scene = null, mascot) {
  if (!mascot) throw new Error("A mascot constellation is required (config/mascot.json).");
  const config = SCENES[scene] ?? {};
  const phrases = phrasesFor(i18n, scene);
  const count = phrases.length;
  const total = count * SLOT_SECONDS;
  const x0 = 50;
  const out = [
    `<svg width="900" height="240" viewBox="0 0 900 240" ${NS} font-family="${FONT}" role="img" aria-label="${esc(i18n.readme.altBanner)}">`, "<defs>",
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.bg}"/><stop offset="1" stop-color="${T.bg2}"/></linearGradient>`,
    `<radialGradient id="glow" cx="0.8" cy="0.5" r="0.5"><stop offset="0" stop-color="${T.accent}" stop-opacity="${T.glow}"/><stop offset="1" stop-color="${T.accent}" stop-opacity="0"/></radialGradient>`,
    `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${T.dots}"/></pattern>`,
    '<clipPath id="frame"><rect x="1" y="1" width="898" height="238" rx="12"/></clipPath>',
    '<filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>',
  ];
  const cursor = [];
  phrases.forEach((phrase, i) => {
    const width = phrase.length * CHAR_WIDTH;
    const a = i / count;
    const { keyTimes, values } = keyframes([[0, 0], [a, 0], [a + 0.4 / count, width], [a + 0.84 / count, width], [a + 0.94 / count, 0], [(i + 1) / count, 0], [1, 0]]);
    out.push(`<clipPath id="ph${i}"><rect x="${x0 - 2}" y="110" height="44" width="0"><animate attributeName="width" dur="${total}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/></rect></clipPath>`);
    cursor.push([a, x0], [a + 0.4 / count, x0 + width], [a + 0.84 / count, x0 + width], [a + 0.94 / count, x0]);
  });
  out.push("</defs>",
    `<rect x="0.5" y="0.5" width="899" height="239" rx="12" fill="url(#g)" stroke="${T.border}"/>`,
    '<rect x="1" y="1" width="898" height="238" rx="12" fill="url(#dots)" opacity="0.55"/>',
    '<rect x="1" y="1" width="898" height="238" rx="12" fill="url(#glow)"/>');
  const random = createRandom(SCENE_SEEDS[scene] ?? 1);
  if (scene === "pi") out.push(overlayPi(T, random));
  out.push(nameWord(T));
  const fightTimes = "0;.06;.20;.76;.90;1";
  if (config.fall) out.push(bFalling(T));
  else if (config.fight) out.push(`<g><animateTransform attributeName="transform" type="translate" values="0,0;0,0;140,0;140,0;0,0;0,0" keyTimes="${fightTimes}" dur="10s" repeatCount="indefinite"/>${letterB(T)}</g>`, dot(T));
  else if (config.bloody) out.push(bloodyB(T), dot(T));
  else out.push(letterB(T), dot(T));
  if (config.hat) out.push(hatOnB());
  if (config.knife) out.push(knife());
  phrases.forEach((phrase, i) => {
    out.push(`<text x="${x0}" y="142" font-size="23" fill="${T.accent}" textLength="${num(phrase.length * CHAR_WIDTH)}" lengthAdjust="spacingAndGlyphs" clip-path="url(#ph${i})">${esc(phrase)}</text>`);
  });
  const { keyTimes, values } = keyframes([[0, x0], ...cursor, [1, x0]]);
  out.push(`<rect y="122" width="3" height="25" rx="1" fill="${T.accent}"><animate attributeName="x" dur="${total}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/><animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite"/></rect>`,
    `<text x="50" y="176" font-size="16" fill="${T.muted}">${esc(i18n.sub)}</text>`,
    `<g transform="translate(50,194)"><rect width="132" height="26" rx="13" fill="${T.panel}" stroke="${T.border}"/><circle cx="16" cy="13" r="4" fill="${T.accent2}"><animate attributeName="opacity" values="1;.3;1" dur="2s" repeatCount="indefinite"/></circle><text x="28" y="18" font-size="12" fill="${T.fg}">${esc(i18n.location)}</text></g>`);
  const face = constellation(T, mascot);
  out.push(config.fight
    ? `<g><animateTransform attributeName="transform" type="translate" values="0,0;0,0;-250,-62;-250,-62;0,0;0,0" keyTimes="${fightTimes}" dur="10s" repeatCount="indefinite"/>${face}</g>`
    : face);
  if (config.badgerSnow) out.push(badgerSnow());
  if (config.snorkel) out.push(snorkel());
  out.push(snitch(T, config.snitch ?? "normal"));
  if (config.water) out.push(overlayWater());
  if (config.fight) out.push(saberFight());
  if (scene !== "pi") for (const name of config.overlays ?? []) out.push(OVERLAYS[name](T, createRandom(SCENE_SEEDS[name] ?? 1)));
  out.push("</svg>");
  return out.join("\n");
}

module.exports = { banner, SCENES, phrasesFor };
