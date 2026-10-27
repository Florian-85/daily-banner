"use strict";
// Small SVG helpers shared by the profile generator. No dependency.

const FONT = "'Segoe UI',Ubuntu,'Helvetica Neue',Sans-Serif";
const NS = 'xmlns="http://www.w3.org/2000/svg"';

function esc(value) {
  return String(value).replace(/[&<>"']/g, character => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]
  ));
}

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const num = (value, digits = 2) => String(round(value, digits));

// Five-pointed star, optionally with child elements (animations).
function star(cx, cy, r, fill, stroke, strokeWidth = 1.5, inner = "", innerRatio = 0.42) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const radius = i % 2 === 0 ? r : r * innerRatio;
    points.push(`${num(cx + radius * Math.cos(angle), 1)},${num(cy + radius * Math.sin(angle), 1)}`);
  }
  const attributes = `points="${points.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"`;
  return inner ? `<polygon ${attributes}>${inner}</polygon>` : `<polygon ${attributes}/>`;
}

function pill(T, x, y, text, options = {}) {
  const size = options.size ?? 12;
  const height = options.height ?? 22;
  const width = Math.trunc(text.length * size * 0.6 + 18);
  const svg = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${Math.floor(height / 2)}" fill="${options.fill ?? T.panel}" stroke="${options.stroke ?? T.border}"/>` +
    `<text x="${num(x + width / 2)}" y="${num(y + height / 2 + 4)}" text-anchor="middle" font-size="${size}" fill="${options.color ?? T.muted}">${esc(text)}</text>`;
  return { svg, width };
}

// Builds keyTimes/values lists for SMIL from [time, value] pairs (times clamped to 0..1).
function keyframes(points) {
  const out = [];
  for (const [time, value] of points) {
    let t = round(Math.min(Math.max(time, 0), 1), 4);
    if (out.length && t < out[out.length - 1][0]) t = out[out.length - 1][0];
    out.push([t, value]);
  }
  if (out[0][0] !== 0) out.unshift([0, out[0][1]]);
  if (out[out.length - 1][0] !== 1) out.push([1, out[out.length - 1][1]]);
  return { keyTimes: out.map(([t]) => t).join(";"), values: out.map(([, v]) => num(v, 2)).join(";") };
}

// Deterministic pseudo-random numbers (mulberry32): the same date always draws the same picture.
function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (low, high) => low + Math.floor(next() * (high - low + 1)),
    uniform: (low, high) => low + next() * (high - low),
    choice: list => list[Math.floor(next() * list.length)],
  };
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const isDark = T => luminance(T.bg) < 0.4;

// Minimal well-formedness check used by the tests (balanced tags, one svg root).
function isWellFormedSvg(source) {
  if (!/^<svg\b[^>]*>/.test(source) || !source.trimEnd().endsWith("</svg>")) return false;
  const stack = [];
  const tag = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let match;
  while ((match = tag.exec(source))) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

module.exports = { FONT, NS, esc, round, num, star, pill, keyframes, createRandom, luminance, isDark, isWellFormedSvg };
