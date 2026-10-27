"use strict";
// Draws one banner: the name, the typed headline, the mascot and the scene of the day.
// Pure function of its arguments: the same inputs always give the same bytes.

const { FONT, NS, esc, num, keyframes } = require("./svg.cjs");
const { createText } = require("./text.cjs");
const { layoutName } = require("./layout.cjs");
const { phrasesFor, drawLayers, SCENES, WATER_LINE, WIDTH, HEIGHT } = require("./scenes.cjs");

const SLOT_SECONDS = 7;
const TEXT_X = 50;
// The typed line stops before the mascot; longer phrases are squeezed to fit instead of leaving the picture.
const MAX_TEXT_WIDTH = 640;
const MASCOT = { x: 705, y: 48, scale: 0.8 };
const HALLOWEEN_ORANGE = { dark: "#FF8A1F", light: "#C2410C" };

function mascotContext(mascot) {
  if (!mascot) return null;
  return {
    scale: MASCOT.scale,
    at: name => {
      const point = mascot.anchors[name];
      return point ? [MASCOT.x + point[0] * MASCOT.scale, MASCOT.y + point[1] * MASCOT.scale] : null;
    },
  };
}

function nameMarkup(T, layout, effect, dark, textEngine) {
  const { size, baseline, pieces } = layout;
  const text = (piece, fill = T.fg) => textEngine.draw({ text: piece.text, x: piece.x, y: baseline, size, fill, bold: true }).markup;
  const { before, initial, rest, after } = pieces;
  const tail = [rest, after].filter(Boolean);
  const out = [];
  if (before) out.push(text(before));
  if (effect === "fall") {
    const pivot = `${initial.x + initial.width} ${baseline}`;
    const tip = `<animateTransform attributeName="transform" type="rotate" values="0 ${pivot};0 ${pivot};90 ${pivot};82 ${pivot};90 ${pivot};90 ${pivot};0 ${pivot};0 ${pivot}" keyTimes="0;.4;.47;.5;.53;.88;.95;1" dur="12s" repeatCount="indefinite"/>`;
    const roll = `<animateTransform attributeName="transform" type="translate" values="0,0;0,0;${initial.width},0;${initial.width},0;0,0;0,0" keyTimes="0;.47;.55;.9;.97;1" dur="12s" repeatCount="indefinite"/>`;
    out.push(`<g>${tip}${text(initial)}</g>`);
    if (tail.length) out.push(`<g>${roll}${tail.map(piece => text(piece)).join("")}</g>`);
    out.push(`<text x="${initial.x + 8}" y="${layout.anchors["name.initial"].top - 1}" font-size="20" font-weight="700" fill="${T.gold}" opacity="0">+1` +
      '<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.94;.95;.99;1" dur="12s" repeatCount="indefinite"/>' +
      '<animateTransform attributeName="transform" type="translate" values="0,14;0,14;0,14;0,-12;0,-16" keyTimes="0;.94;.95;.99;1" dur="12s" repeatCount="indefinite"/></text>');
    return out.join("");
  }
  if (effect === "glow") {
    const color = dark ? HALLOWEEN_ORANGE.dark : HALLOWEEN_ORANGE.light;
    out.push(`<g opacity=".5" filter="url(#blur)">${text(initial, color)}<animate attributeName="opacity" values=".25;.6;.25" dur="2.4s" repeatCount="indefinite"/></g>`);
    out.push(text(initial, color));
  } else {
    out.push(text(initial));
  }
  for (const piece of tail) out.push(text(piece));
  return out.join("");
}

// config: validated configuration; options: { scene, phrases (already ordered), T, dark, mascot, dayOfYear }
function banner(T, { config, scene = null, phrases, mascot, dark }) {
  const shape = SCENES[scene] ? scene : null;
  const textEngine = createText({ font: config.font, backend: config.textBackend });
  const layout = layoutName(config.name, { highlight: config.highlight, maxWidth: mascot ? 610 : 800, text: textEngine });
  const phraseWidth = phrase => Math.min(textEngine.measure(phrase, 23), MAX_TEXT_WIDTH);
  const placed = mascotContext(mascot);
  const anchor = name => layout.anchors[name] ?? null;
  const context = { T, dark, anchor, mascot: placed, layout };
  const count = phrases.length;
  const total = count * SLOT_SECONDS;
  const label = config.alt ?? `Animated banner of ${config.name}`;
  const out = [
    `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" ${NS} font-family="${FONT}" role="img" aria-label="${esc(label)}">`,
    `<title>${esc(label)}</title>`, "<defs>",
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.bg}"/><stop offset="1" stop-color="${T.bg2}"/></linearGradient>`,
    `<radialGradient id="glow" cx="0.8" cy="0.5" r="0.5"><stop offset="0" stop-color="${T.accent}" stop-opacity="${T.glow}"/><stop offset="1" stop-color="${T.accent}" stop-opacity="0"/></radialGradient>`,
    `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${T.dots}"/></pattern>`,
    '<clipPath id="frame"><rect x="1" y="1" width="898" height="238" rx="12"/></clipPath>',
    '<filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>',
  ];
  const cursor = [];
  phrases.forEach((phrase, i) => {
    const width = phraseWidth(phrase);
    const a = i / count;
    const { keyTimes, values } = keyframes([[0, 0], [a, 0], [a + 0.4 / count, width], [a + 0.84 / count, width], [a + 0.94 / count, 0], [(i + 1) / count, 0], [1, 0]]);
    out.push(`<clipPath id="ph${i}"><rect x="${TEXT_X - 2}" y="110" height="44" width="0"><animate attributeName="width" dur="${total}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/></rect></clipPath>`);
    cursor.push([a, TEXT_X], [a + 0.4 / count, TEXT_X + width], [a + 0.84 / count, TEXT_X + width], [a + 0.94 / count, TEXT_X]);
  });
  const glyphSlot = out.length;
  out.push("", "</defs>",
    `<rect x="0.5" y="0.5" width="899" height="239" rx="12" fill="url(#g)" stroke="${T.border}"/>`,
    '<rect x="1" y="1" width="898" height="238" rx="12" fill="url(#dots)" opacity="0.55"/>',
    '<rect x="1" y="1" width="898" height="238" rx="12" fill="url(#glow)"/>');
  if (shape) out.push(drawLayers(shape, "behind", context));
  out.push(nameMarkup(T, layout, SCENES[shape]?.nameEffect, dark, textEngine));
  if (shape) out.push(drawLayers(shape, "onName", context));
  phrases.forEach((phrase, i) => {
    out.push(textEngine.draw({ text: phrase, x: TEXT_X, y: 142, size: 23, fill: T.accent, maxWidth: MAX_TEXT_WIDTH, attributes: `clip-path="url(#ph${i})"` }).markup);
  });
  const { keyTimes, values } = keyframes([[0, TEXT_X], ...cursor, [1, TEXT_X]]);
  out.push(`<rect y="122" width="3" height="25" rx="1" fill="${T.accent}"><animate attributeName="x" dur="${total}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/><animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite"/></rect>`);
  if (config.subtitle) out.push(textEngine.draw({ text: config.subtitle, x: 50, y: 176, size: 16, fill: T.muted, maxWidth: MAX_TEXT_WIDTH }).markup);
  if (config.location) {
    const width = Math.max(80, Math.round(textEngine.measure(config.location, 12) + 40));
    out.push(`<g transform="translate(50,194)"><rect width="${width}" height="26" rx="13" fill="${T.panel}" stroke="${T.border}"/><circle cx="16" cy="13" r="4" fill="${T.accent2}"><animate attributeName="opacity" values="1;.3;1" dur="2s" repeatCount="indefinite"/></circle>${textEngine.draw({ text: config.location, x: 28, y: 18, size: 12, fill: T.fg }).markup}</g>`);
  }
  if (mascot) {
    out.push(`<g transform="translate(${MASCOT.x},${MASCOT.y}) scale(${MASCOT.scale})">${mascot.svg(T)}</g>`);
    if (shape) out.push(drawLayers(shape, "onMascot", context));
  }
  if (shape) out.push(drawLayers(shape, "overlay", context));
  out[glyphSlot] = textEngine.defs();
  out.push("</svg>");
  return out.join("\n");
}

module.exports = { banner, phrasesFor, WATER_LINE };
