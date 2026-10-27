"use strict";
// Mascots are data. Each one is drawn in a 200 x 200 box and declares named anchors in that box.
// Level 0 anchors (top, bottom, left, right, center) exist for every mascot; the others are declared.

const fs = require("node:fs");
const { esc, num, star } = require("./svg.cjs");

const BOX = 200;

function boxAnchors(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const centerX = (left + right) / 2;
  return { top: [centerX, top], bottom: [centerX, bottom], left: [left, (top + bottom) / 2], right: [right, (top + bottom) / 2], center: [centerX, (top + bottom) / 2] };
}

// ---------- the cat: an original drawing, sitting, seen from the front ----------
const CAT_ANCHORS = {
  "head-top": [100, 50], "ear-left": [70, 36], "ear-right": [130, 36], "eye-left": [84, 84], "eye-right": [116, 84],
  nose: [100, 100], mouth: [100, 108], "whisker-left": [62, 102], "whisker-right": [138, 102],
  "paw-left": [80, 190], "paw-right": [120, 190], back: [138, 140], tail: [170, 130], base: [100, 198],
};

function catSvg(T) {
  const line = `stroke="${T.accent}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  const eye = (x, begin) => `<ellipse cx="${x}" cy="84" rx="6" ry="8" fill="${T.accent2}"><animate attributeName="ry" values="8;8;1;8" keyTimes="0;.94;.97;1" dur="5s" begin="${begin}s" repeatCount="indefinite"/></ellipse>` +
    `<ellipse cx="${x}" cy="85" rx="2.4" ry="5" fill="${T.bg}"/><circle cx="${x - 2}" cy="81" r="1.6" fill="#FFFFFF"/>`;
  const twinkle = (x, y, r, dur) => star(x, y, r, T.gold, T.gold, 1, `<animate attributeName="opacity" values="1;.45;1" dur="${dur}s" repeatCount="indefinite"/>`);
  return `<path d="M146,186 C196,186 198,134 170,120" fill="none" stroke="${T.accent}" stroke-width="9" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="-5 146 186;7 146 186;-5 146 186" dur="3.6s" repeatCount="indefinite"/></path>` +
    `<path d="M58,192 C50,140 68,118 100,118 C132,118 150,140 142,192 Z" fill="${T.panel}" ${line}/>` +
    `<ellipse cx="80" cy="190" rx="14" ry="8" fill="${T.panel}" ${line}/><ellipse cx="120" cy="190" rx="14" ry="8" fill="${T.panel}" ${line}/>` +
    `<polygon points="58,64 62,20 94,50" fill="${T.panel}" ${line}/><polygon points="142,64 138,20 106,50" fill="${T.panel}" ${line}/>` +
    `<polygon points="66,54 68,34 82,47" fill="${T.accent}" opacity=".4"/><polygon points="134,54 132,34 118,47" fill="${T.accent}" opacity=".4"/>` +
    `<ellipse cx="100" cy="88" rx="44" ry="38" fill="${T.panel}" ${line}/>` +
    eye(84, 0) + eye(116, 0) +
    `<polygon points="96,97 104,97 100,103" fill="${T.accent}"/>` +
    `<path d="M100,103 L100,107 M100,107 Q94,114 89,109 M100,107 Q106,114 111,109" fill="none" stroke="${T.muted}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M60,98 L30,92 M60,104 L28,106 M140,98 L170,92 M140,104 L172,106" fill="none" stroke="${T.muted}" stroke-width="1.6" stroke-linecap="round"/>` +
    twinkle(24, 40, 7, 2.6) + twinkle(178, 62, 5, 3.3) + twinkle(160, 16, 4, 2.9);
}

// ---------- a constellation: points [x, y, radius] joined by lines ----------
function constellationSvg(T, data) {
  const color = T.gold;
  const parts = [];
  for (const [a, b] of data.outline) {
    const [x1, y1] = data.points[a];
    const [x2, y2] = data.points[b];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="3 4"/>`);
  }
  for (const [a, b] of data.stripes) {
    const [x1, y1] = data.points[a];
    const [x2, y2] = data.points[b];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity=".85" stroke-width="1.8"/>`);
  }
  data.points.forEach(([x, y, r], i) => {
    parts.push(star(x, y, r + 2.8, color, color, 1, `<animate attributeName="opacity" values="1;.45;1" dur="${num(2.6 + (i % 5) * 0.7)}s" repeatCount="indefinite"/>`));
  });
  return parts.join("");
}

const STARS = {
  points: [[100, 24, 6], [144, 76, 4], [100, 176, 5], [56, 76, 4], [100, 100, 4], [170, 130, 3], [30, 134, 3], [100, 62, 3]],
  outline: [[0, 1], [1, 2], [2, 3], [3, 0]],
  stripes: [[0, 7], [7, 4], [4, 2], [3, 1], [5, 1], [6, 3]],
  anchors: { "head-top": [100, 24], nose: [100, 100], mouth: [100, 100], base: [100, 176] },
};

function validateConstellation(data, where) {
  const fail = message => { throw new Error(`${where}: ${message}`); };
  if (!data || typeof data !== "object") fail("the mascot file must be a JSON object.");
  const { points, outline = [], stripes = [], anchors = {} } = data;
  if (!Array.isArray(points) || points.length < 2 || points.length > 60) fail('"points" must be a list of 2 to 60 stars: [[x, y, radius], …].');
  const finite = value => typeof value === "number" && Number.isFinite(value);
  points.forEach((point, i) => {
    if (!Array.isArray(point) || point.length !== 3 || !point.every(finite)) fail(`points[${i}] must be three numbers [x, y, radius].`);
    if (point[0] < 0 || point[0] > BOX || point[1] < 0 || point[1] > BOX) fail(`points[${i}] is outside the ${BOX} x ${BOX} box.`);
    if (point[2] <= 0 || point[2] > 20) fail(`points[${i}] needs a radius between 0 and 20.`);
  });
  for (const [key, links] of [["outline", outline], ["stripes", stripes]]) {
    if (!Array.isArray(links) || links.length > 120) fail(`"${key}" must be a list of pairs of star numbers.`);
    links.forEach((pair, i) => {
      const ok = Array.isArray(pair) && pair.length === 2 && pair.every(index => Number.isInteger(index) && index >= 0 && index < points.length);
      if (!ok) fail(`${key}[${i}] must be two star numbers between 0 and ${points.length - 1}.`);
    });
  }
  if (!anchors || typeof anchors !== "object" || Array.isArray(anchors)) fail('"anchors" must be an object: { "head-top": [x, y] }.');
  for (const [name, point] of Object.entries(anchors)) {
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) fail(`anchor name "${name}" must be lowercase letters, digits and dashes.`);
    if (!Array.isArray(point) || point.length !== 2 || !point.every(finite)) fail(`anchor "${name}" must be two numbers [x, y].`);
  }
  return { points, outline, stripes, anchors };
}

// Returns { svg(T), anchors } with anchors in the 200 x 200 box, or null for "none".
function loadMascot(choice) {
  if (choice === "none") return null;
  if (choice === "cat") return { name: "cat", svg: catSvg, anchors: { ...boxAnchors([[28, 20], [172, 198]]), ...CAT_ANCHORS } };
  if (choice === "stars") return { name: "stars", svg: T => constellationSvg(T, STARS), anchors: { ...boxAnchors(STARS.points.map(([x, y]) => [x, y])), ...STARS.anchors } };
  const file = choice.file;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`Can not read the mascot file ${file}: ${error.code === "ENOENT" ? "file not found" : error.message}`);
  }
  const checked = validateConstellation(data, `Mascot file ${esc(file)}`);
  return { name: "custom", svg: T => constellationSvg(T, checked), anchors: { ...boxAnchors(checked.points.map(([x, y]) => [x, y])), ...checked.anchors } };
}

module.exports = { loadMascot, BOX };
