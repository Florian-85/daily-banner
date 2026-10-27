"use strict";
// Text engine: measures text with the real widths of a bundled font and draws it with one of three backends.
//   outlines  letters drawn as vector shapes (default): identical on every machine, exact anchors
//   embedded  real <text> using a font subset carried inside the SVG: selectable, same widths
//   system    <text> in the viewer's own fonts, squeezed to the same widths
// All three lay text out with the same tables, so a scene attaches to the same place whichever one is used.
// Characters the bundled font does not cover are drawn by the viewer's fonts at an estimated width.

const fs = require("node:fs");
const path = require("node:path");
const { esc, num } = require("./svg.cjs");

const FONT_IDS = ["poppins", "spectral", "nunito", "caveat", "silkscreen"];
const BACKENDS = ["auto", "outlines", "embedded", "system"];
const DEFAULT_FONT = "poppins";
const FONTS_DIR = path.join(__dirname, "..", "..", "fonts");
const EMBEDDED_FAMILY = "DailyBannerFont";

const cache = new Map();

function loadFont(id) {
  if (!FONT_IDS.includes(id)) throw new Error(`Unknown font "${id}".`);
  if (!cache.has(id)) {
    const data = JSON.parse(fs.readFileSync(path.join(FONTS_DIR, id, "glyphs.json"), "utf8"));
    cache.set(id, { ...data, bold: data.role === "pixel" ? 0 : 22 });
  }
  return cache.get(id);
}

const embeddedData = id => fs.readFileSync(path.join(FONTS_DIR, id, "subset.woff.b64"), "utf8").trim();

// Estimated width, in thousandths of an em, of a character the font does not cover.
const uncoveredAdvance = character => (character.codePointAt(0) >= 0x2e80 || character.codePointAt(0) >= 0x1f000 ? 1000 : 600);

function createText({ font: id = DEFAULT_FONT, backend = "auto" } = {}) {
  const font = loadFont(id);
  const mode = backend === "auto" ? "outlines" : backend;
  if (!BACKENDS.includes(backend)) throw new Error(`Unknown text backend "${backend}".`);
  const used = new Set();

  const advance = character => (font.glyphs[character] ? font.glyphs[character][0] : uncoveredAdvance(character));
  const units = text => Array.from(text).reduce((sum, character) => sum + advance(character), 0);
  const measure = (text, size) => (units(text) * size) / 1000;

  // Consecutive characters the font covers (or not) are drawn together.
  function runs(text) {
    const result = [];
    for (const character of Array.from(text)) {
      const covered = Boolean(font.glyphs[character]);
      const last = result[result.length - 1];
      if (last && last.covered === covered) last.text += character; else result.push({ text: character, covered });
    }
    return result;
  }

  const glyphId = character => `u${character.codePointAt(0).toString(16)}`;

  // One piece of text. Returns the markup and the width it takes. `maxWidth` squeezes it horizontally to fit.
  function draw({ text, x, y, size, fill, bold = false, maxWidth = Infinity, attributes = "" }) {
    const natural = measure(text, size);
    const squeeze = natural > maxWidth ? maxWidth / natural : 1;
    const width = natural * squeeze;
    const stroke = bold && font.bold ? ` stroke="${fill}" stroke-width="${num(font.bold * size / 1000, 2)}" stroke-linejoin="round"` : "";
    const extra = attributes ? ` ${attributes}` : "";

    if (mode !== "outlines") {
      const family = mode === "embedded" ? ` font-family="${EMBEDDED_FAMILY}"` : "";
      const fit = ` textLength="${num(width)}" lengthAdjust="spacingAndGlyphs"`;
      return { width, markup: `<text x="${num(x)}" y="${num(y)}"${family} font-size="${size}" fill="${fill}"${stroke}${fit}${extra}>${esc(text)}</text>` };
    }

    // Outlines: glyph shapes are defined once in <defs> and placed with <use>; coordinates there are thousandths of an em.
    const scale = size / 1000;
    const style = stroke ? ` fill="${fill}" stroke="${fill}" stroke-width="${font.bold}" stroke-linejoin="round"` : ` fill="${fill}"`;
    const out = [];
    let current = [];
    let cursor = 0;
    const closeGroup = () => {
      if (!current.length) return;
      out.push(`<g transform="translate(${num(x)} ${num(y)}) scale(${num(scale * squeeze, 5)} ${num(scale, 5)})"${style}>${current.join("")}</g>`);
      current = [];
    };
    for (const run of runs(text)) {
      if (run.covered) {
        for (const character of Array.from(run.text)) {
          const [advanceWidth, shape] = font.glyphs[character];
          if (shape) {
            used.add(character);
            current.push(`<use href="#${glyphId(character)}"${cursor ? ` x="${cursor}"` : ""}/>`);
          }
          cursor += advanceWidth;
        }
      } else {
        const length = units(run.text);
        closeGroup();
        out.push(`<text x="${num(x + cursor * scale * squeeze)}" y="${num(y)}" font-size="${size}" fill="${fill}" textLength="${num(length * scale * squeeze)}" lengthAdjust="spacingAndGlyphs">${esc(run.text)}</text>`);
        cursor += length;
      }
    }
    closeGroup();
    // Attributes such as clip-path go on a plain wrapper: they are resolved before the scaling above.
    return { width, markup: attributes ? `<g ${attributes}>${out.join("")}</g>` : out.join("") };
  }

  // The markup that has to sit once in <defs> for what was drawn so far.
  function defs() {
    if (mode === "embedded") {
      return `<style>@font-face{font-family:${EMBEDDED_FAMILY};src:url(data:font/woff;base64,${embeddedData(id)}) format("woff")}</style>`;
    }
    if (mode !== "outlines") return "";
    return [...used].sort().map(character => `<path id="${glyphId(character)}" d="${font.glyphs[character][1]}"/>`).join("");
  }

  return { font, mode, measure, draw, defs, capHeight: font.capHeight / 1000, covers: character => Boolean(font.glyphs[character]) };
}

module.exports = { createText, loadFont, FONT_IDS, BACKENDS, DEFAULT_FONT };
