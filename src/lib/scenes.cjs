"use strict";
// The built-in scenes. A scene never holds coordinates: it attaches drawings to anchors
// (name.initial, mascot.head-top, mascot.mouth, banner.water-line…) that the engine resolves.
// Every animation is plain SMIL, which GitHub renders inside a README <img>.
// Accessibility: nothing may flash more than 3 times per second (WCAG 2.3.1): see the test.

const { num, createRandom, isDark, star } = require("./svg.cjs");

const WATER_LINE = 130;
const WIDTH = 900;
const HEIGHT = 240;

// ---------- drawings attached to anchors ----------
function santaHat({ anchor }) {
  const initial = anchor("name.initial");
  const height = initial.bottom - initial.top;
  const scale = (initial.width * 1.2) / 42;
  return `<g transform="translate(${num(initial.x)},${num(initial.top + height * 0.2)}) scale(${num(scale, 3)}) translate(-286,-70)">` +
    '<g><animateTransform attributeName="transform" type="rotate" values="-3 286 64;3 286 64;-3 286 64" dur="3s" repeatCount="indefinite"/>' +
    '<path d="M268,66 Q286,56 304,66 L298,39 Q292,32 284,40 Z" fill="#D62828"/>' +
    '<rect x="265" y="62" width="42" height="8" rx="4" fill="#FFFFFF"/><circle cx="298" cy="35" r="5" fill="#FFFFFF"/></g></g>';
}

function snowCap({ mascot }) {
  const top = mascot?.at("head-top");
  if (!top) return "";
  return `<g transform="translate(${num(top[0])},${num(top[1] + 3 * mascot.scale)}) scale(${num(mascot.scale, 3)})" fill="#FFFFFF">` +
    '<path d="M-28,2 Q-22,-14 0,-17 Q22,-14 28,2 Q20,-4 14,1 Q7,-6 0,0 Q-7,-6 -14,1 Q-20,-4 -28,2 Z" opacity=".95"/>' +
    '<circle cx="-30" cy="3" r="2.6"/><circle cx="30" cy="3" r="2.6"/></g>';
}

function snorkel({ mascot }) {
  const mouth = mascot?.at("mouth") ?? mascot?.at("nose");
  if (!mouth) return "";
  const [x, y] = mouth;
  const top = WATER_LINE - 26;
  const side = x + 44;
  const path = `M${num(x)},${num(y)} C${num(x + 16)},${num(y + 8)} ${num(side + 4)},${num(y - 6)} ${num(side)},${num(y - (y - top) * 0.55)} L${num(side)},${num(top)}`;
  return `<path d="${path}" fill="none" stroke="#FFC857" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="${path}" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-dasharray="3 8" opacity=".8"/>` +
    `<circle cx="${num(x)}" cy="${num(y)}" r="3.8" fill="#FF7A59"/><rect x="${num(side - 5)}" y="${num(top - 9)}" width="10" height="9" rx="2.5" fill="#FF7A59"/>`;
}

// ---------- overlays ----------
function overlaySnow({ T, random }) {
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
      '<animateTransform attributeName="transform" type="scale" values="1 1;1 .35;1 1" dur=".7s" repeatCount="indefinite"/></g>' +
      `<animateMotion dur="${duration}s" begin="${begin}s" repeatCount="indefinite" path="${path}"/></g>`;
  }).join("");
}

function overlayConfetti({ T, random }) {
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
  let wave = `M-100,${WATER_LINE - 2} q25,-9 50,0 t50,0`;
  for (let i = 0; i < 10; i++) wave += " t50,0 t50,0";
  const bubbles = [[300, 3, 6, 0], [470, 2.2, 8, 3], [620, 3.4, 7, 5], [760, 2.4, 9, 2], [150, 2.6, 8, 1], [830, 2.4, 5, 2]]
    .map(([x, r, d, b]) => `<circle cx="${x}" cy="240" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity=".7"><animate attributeName="cy" from="246" to="${WATER_LINE + 2}" dur="${d}s" repeatCount="indefinite" begin="-${b}s"/></circle>`).join("");
  const fish = '<g><ellipse rx="15" ry="7.5" fill="#FF7A59"/><polygon points="-13,0 -26,-8 -26,8" fill="#FF7A59"/><circle cx="7" cy="-2" r="2" fill="#fff"/><circle cx="7.6" cy="-2" r="1" fill="#14171C"/>' +
    '<animateMotion dur="12s" repeatCount="indefinite" path="M -40,180 C 200,150 420,215 700,165 S 880,200 960,170"/></g>';
  const slide = '<animateTransform attributeName="transform" type="translate" from="0,0" to="-100,0" dur="4s" repeatCount="indefinite"/>';
  return '<g clip-path="url(#frame)">' +
    `<rect x="0" y="${WATER_LINE}" width="${WIDTH}" height="${HEIGHT - WATER_LINE}" fill="#2B7BD6" opacity=".26"/>` +
    `<path d="${wave} L900,240 L-100,240 Z" fill="#2B7BD6" opacity=".18">${slide}</path>` +
    `<path d="${wave}" fill="none" stroke="#9FD0FF" stroke-opacity=".8" stroke-width="1.6">${slide}</path>${bubbles}${fish}</g>`;
}

function overlayPi({ T, random }) {
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

// ---------- the scenes ----------
// layers: behind (before the name), onName, onMascot, overlay. nameEffect changes how the initial is drawn.
// tags let an owner leave a scene out; requires lists the anchors without which the scene can not work.
const SCENES = {
  noel: {
    tags: ["calm", "religious-origin"], requires: ["name.initial"], mode: "prefix", seed: 3,
    phrases: { en: ["Merry Christmas!", "Happy holidays!"], fr: ["Joyeux Noël !", "Joyeuses fêtes !"] },
    onName: [santaHat], onMascot: [snowCap], overlay: [overlaySnow],
  },
  halloween: {
    tags: ["scary"], requires: ["name.initial"], mode: "prefix", seed: 1, nameEffect: "glow",
    phrases: { en: ["Happy Halloween!"], fr: ["Joyeux Halloween !"] },
    overlay: [overlayBats],
  },
  "new-year": {
    tags: ["calm"], requires: [], mode: "prefix", seed: 7,
    phrases: { en: ["Happy New Year!"], fr: ["Bonne année !"] },
    overlay: [overlayConfetti],
  },
  birthday: {
    tags: ["calm"], requires: ["name.initial"], mode: "prefix", seed: 7, nameEffect: "fall",
    phrases: { en: ["Happy birthday!"], fr: ["Joyeux anniversaire !"] },
    overlay: [overlayConfetti],
  },
  "april-fools": {
    tags: ["humor"], requires: [], mode: "prefix", seed: 1,
    phrases: { en: ["April Fools!"], fr: ["Poisson d'avril !"] },
    onMascot: [snorkel], overlay: [overlayWater],
  },
  pi: {
    tags: ["geek"], requires: [], mode: "prefix", seed: 5,
    phrases: { en: ["3.14159… Happy Pi Day!"], fr: ["3,14159… Joyeux jour de Pi !"] },
    behind: [overlayPi],
  },
};

const SCENE_IDS = Object.keys(SCENES);

function phrasesFor(scene, lang, base) {
  const extra = SCENES[scene]?.phrases[lang];
  if (!extra) return base;
  return SCENES[scene].mode === "replace" ? extra : [...extra, ...base];
}

// Draws one group of layers; each layer receives the same context.
function drawLayers(scene, group, context) {
  const definition = SCENES[scene];
  if (!definition) return "";
  return (definition[group] ?? []).map(layer => layer({ ...context, random: createRandom(definition.seed ?? 1) })).join("");
}

module.exports = { SCENES, SCENE_IDS, phrasesFor, drawLayers, WATER_LINE, WIDTH, HEIGHT, star };
