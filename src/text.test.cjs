const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createText, loadFont, FONT_IDS, BACKENDS } = require("./lib/text.cjs");
const { validate } = require("./lib/config.cjs");
const { generate, OUTPUT } = require("./lib/generate.cjs");
const { isWellFormedSvg } = require("./lib/svg.cjs");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8").split(String.fromCharCode(13)).join("");
const FRENCH = "AÀÂÆBCÇDEÉÈÊËFGHIÎÏJKLMNOÔŒPQRSTUÙÛÜVWXYŸZaàâæbcçdeéèêëfghiîïjklmnoôœpqrstuùûüvwxyÿz0123456789 .,;:!?'’\"()-–—…«»€@&";

test("the five launch fonts are bundled, each with its licence and copyright", () => {
  assert.deepEqual(FONT_IDS, ["poppins", "spectral", "nunito", "caveat", "silkscreen"]);
  const credits = read("CREDITS.md");
  for (const id of FONT_IDS) {
    const font = loadFont(id);
    const licence = read(`fonts/${id}/OFL.txt`);
    assert.match(licence, /SIL OPEN FONT LICENSE Version 1\.1/i);
    assert.match(font.copyright, /^Copyright \d{4} The .+ Project Authors/);
    assert.doesNotMatch(font.copyright, /Reserved Font Name/i, "a reserved name would force a rename of the subset");
    assert.equal(font.licence, "OFL-1.1");
    assert.ok(credits.includes(font.name), `${font.name} is credited`);
    assert.ok(credits.includes(font.source), `${font.name} source is credited`);
  }
});

test("every font covers the French alphabet, digits and usual punctuation", () => {
  for (const id of FONT_IDS) {
    const text = createText({ font: id });
    const missing = Array.from(FRENCH).filter(character => !text.covers(character));
    // The pixel font draws capitals only for letters it has no lower case for, but it still covers every character.
    assert.deepEqual(missing, [], `${id} lacks ${missing.join(" ")}`);
  }
});

test("widths are exact and stable (golden values for Poppins)", () => {
  const text = createText({ font: "poppins" });
  assert.equal(Math.round(text.measure("Ada Lovelace", 54)), 362);
  assert.equal(Math.round(text.measure("Hello, world!", 23)), 137);
  assert.equal(text.measure("", 54), 0);
  assert.ok(text.measure("iiii", 20) < text.measure("WWWW", 20));
});

test("the three backends use the same widths, so anchors do not depend on them", () => {
  for (const id of FONT_IDS) {
    const widths = BACKENDS.map(backend => createText({ font: id, backend }).draw({ text: "Ada Lovelace", x: 0, y: 50, size: 40, fill: "#fff" }).width);
    assert.equal(new Set(widths).size, 1, `${id}: ${widths}`);
  }
});

test("outlines: shapes are defined once and every reference resolves", () => {
  const text = createText({ font: "spectral", backend: "outlines" });
  const markup = text.draw({ text: "Éric Éric", x: 10, y: 80, size: 40, fill: "#fff", bold: true }).markup;
  const defs = text.defs();
  const ids = [...defs.matchAll(/<path id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "no duplicate id");
  assert.deepEqual(ids.sort(), ["u45", "u63", "u69", "u72", "uc9"].sort().filter(id => ids.includes(id)).sort());
  for (const [, id] of markup.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), `${id} is defined`);
  assert.doesNotMatch(markup, /<text/);
  assert.ok(isWellFormedSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${markup}</svg>`));
});

test("a character outside the font is drawn by the viewer's fonts at a reserved width", () => {
  const text = createText({ font: "poppins", backend: "outlines" });
  const { markup, width } = text.draw({ text: "a界b", x: 0, y: 40, size: 20, fill: "#fff" });
  assert.match(markup, /<text [^>]*textLength="20"[^>]*>界<\/text>/);
  assert.equal(Math.round(width), Math.round(text.measure("a", 20) + 20 + text.measure("b", 20)));
  assert.ok(text.measure("😀", 20) === 20);
});

test("a long text is squeezed to the room available, never wider", () => {
  for (const backend of ["outlines", "embedded", "system"]) {
    const text = createText({ font: "silkscreen", backend });
    const { width, markup } = text.draw({ text: "W".repeat(48), x: 50, y: 142, size: 23, fill: "#fff", maxWidth: 640 });
    assert.ok(width <= 640 + 0.001, backend);
    if (backend === "outlines") assert.match(markup, /scale\(0\.\d+ 0\.023\)/, "squeezed horizontally only");
    else assert.match(markup, /textLength="640"/);
  }
});

test("attributes such as a clip are applied outside the scaling, where they are meant", () => {
  const text = createText({ font: "poppins", backend: "outlines" });
  const { markup } = text.draw({ text: "Hi", x: 50, y: 142, size: 23, fill: "#fff", attributes: 'clip-path="url(#ph0)"' });
  assert.match(markup, /^<g clip-path="url\(#ph0\)"><g transform=/);
});

test("embedded: the font travels inside the picture and is small", () => {
  for (const id of FONT_IDS) {
    const text = createText({ font: id, backend: "embedded" });
    const defs = text.defs();
    assert.match(defs, /@font-face\{font-family:DailyBannerFont;src:url\(data:font\/woff;base64,[A-Za-z0-9+/=]+\) format\("woff"\)\}/);
    const bytes = Buffer.from(defs.match(/base64,([^)]+)\)/)[1], "base64");
    assert.equal(bytes.toString("latin1", 0, 4), "wOFF");
    assert.ok(bytes.length < 36 * 1024, `${id} subset is ${bytes.length} bytes`);
    // Every table inflates to its announced size and the usual tables are present.
    const count = bytes.readUInt16BE(12);
    const tags = [];
    for (let i = 0; i < count; i++) {
      const at = 44 + i * 20;
      const offset = bytes.readUInt32BE(at + 4);
      const stored = bytes.readUInt32BE(at + 8);
      const original = bytes.readUInt32BE(at + 12);
      const data = bytes.subarray(offset, offset + stored);
      assert.equal((stored < original ? zlib.inflateSync(data) : data).length, original);
      tags.push(bytes.toString("latin1", at, at + 4));
    }
    for (const tag of ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "OS/2", "post"]) assert.ok(tags.includes(tag), `${id} has ${tag}`);
  }
});

test("system backend carries no font data and no shape definitions", () => {
  assert.equal(createText({ backend: "system" }).defs(), "");
});

test("an unknown font or backend is refused", () => {
  assert.throws(() => createText({ font: "comic" }), /Unknown font/);
  assert.throws(() => createText({ backend: "magic" }), /Unknown text backend/);
});

test("configuration: font and textBackend are checked and have defaults", () => {
  const config = validate({ name: "Ada" });
  assert.equal(config.font, "poppins");
  assert.equal(config.textBackend, "auto");
  assert.throws(() => validate({ name: "Ada", font: "comic" }), /"font" must be one of/);
  assert.throws(() => validate({ name: "Ada", textBackend: "magic" }), /"textBackend" must be one of/);
  assert.equal(validate({ name: "Ada", font: "caveat", textBackend: "embedded" }).font, "caveat");
});

test("every font and backend gives a well-formed, deterministic, reasonably small banner", () => {
  for (const font of FONT_IDS) {
    for (const textBackend of BACKENDS) {
      const config = validate({ name: "Ada Lovelace", headline: ["Développeur curieux", "Écrivain"], subtitle: "Je construis des choses — et j'écris dessus.", location: "Paris · Éire", font, textBackend });
      const first = generate(config, { date: "2026-02-10" });
      const second = generate(config, { date: "2026-02-10" });
      for (const name of Object.values(OUTPUT)) {
        const svg = first.files.get(name);
        assert.ok(isWellFormedSvg(svg), `${font}/${textBackend}/${name}`);
        assert.equal(svg, second.files.get(name), "same bytes");
        assert.ok(Buffer.byteLength(svg) < 120 * 1024, `${font}/${textBackend} is ${Buffer.byteLength(svg)} bytes`);
      }
    }
  }
});

test("the attachment box of the highlighted letter is the ink of that letter, in every font", () => {
  const { layoutName } = require("./lib/layout.cjs");
  const anchorOf = (font, name) => {
    const text = createText({ font });
    const layout = layoutName(name, { maxWidth: 800, text });
    return { layout, anchor: layout.anchors["name.initial"], text };
  };
  for (const id of FONT_IDS) {
    // A capital stands on the baseline and reaches about the cap height.
    const capital = anchorOf(id, "Ada Lovelace");
    const size = capital.layout.size;
    assert.equal(capital.layout.pieces.initial.text, "L");
    assert.ok(Math.abs(capital.anchor.bottom - capital.layout.baseline) <= size * 0.05, `${id}: L stands on the baseline`);
    assert.ok(Math.abs(capital.layout.baseline - capital.anchor.top - size * capital.text.capHeight) <= size * 0.1, `${id}: L reaches the cap height`);
    assert.ok(capital.anchor.left >= capital.layout.pieces.initial.x - size * 0.1 && capital.anchor.right <= capital.layout.pieces.initial.x + capital.layout.pieces.initial.width + size * 0.1);
    // A lower-case letter is lower than a capital; a descender goes below the baseline; an accent goes above the capital.
    const small = anchorOf(id, "ada");
    assert.ok(small.anchor.top > small.layout.baseline - small.layout.size * small.text.capHeight + 2, `${id}: a is lower than a capital`);
    const descender = anchorOf(id, "gigi");
    if (id !== "silkscreen") assert.ok(descender.anchor.bottom > descender.layout.baseline + 2, `${id}: g goes below the baseline`); // the pixel font has no descenders
    const accent = anchorOf(id, "Éric");
    const plain = anchorOf(id, "Eric");
    assert.ok(accent.anchor.top < plain.anchor.top - 2, `${id}: the accent is part of the box`);
  }
});

test("the Christmas hat sits on the ink of a low letter, whatever the font", () => {
  for (const font of ["caveat", "nunito", "poppins"]) {
    const config = validate({ name: "ada", font, surprise: false });
    const svg = generate(config, { date: "2026-12-25" }).files.get(OUTPUT.main);
    const hat = svg.match(/<g transform="translate\(([0-9.]+),([0-9.]+)\) scale\(([0-9.]+)\) translate\(-286,-70\)">/);
    assert.ok(hat, `${font}: the hat is drawn`);
    const { layoutName } = require("./lib/layout.cjs");
    const anchor = layoutName("ada", { maxWidth: 610, text: createText({ font }) }).anchors["name.initial"];
    assert.ok(Math.abs(Number(hat[1]) - (anchor.left + anchor.right) / 2) < 0.5, `${font}: centred on the letter`);
    assert.ok(Math.abs(Number(hat[2]) - (anchor.top + (anchor.bottom - anchor.top) * 0.2)) < 0.5, `${font}: placed from the top of the letter`);
  }
});
