#!/usr/bin/env node
"use strict";
// Authoring tool, not used when a banner is drawn. It turns the five launch fonts into
//   fonts/<id>/glyphs.json       outlines and widths of each character (for the "outlines" backend and the layout)
//   fonts/<id>/subset.woff.b64   the same characters as an embeddable font (for the "embedded" backend)
//   fonts/<id>/OFL.txt           the licence and the authors' copyright
// Usage: node scripts/build-fonts.cjs <folder with the downloaded .ttf and *-OFL.txt files>
const fs = require("node:fs");
const path = require("node:path");
const { open, toPath, subsetTables, toWoff } = require("./fonts/ttf.cjs");

const FONTS = [
  { id: "poppins", name: "Poppins", file: "Poppins-Regular.ttf", licence: "poppins-OFL.txt", role: "sans-serif", source: "https://github.com/itfoundry/Poppins" },
  { id: "spectral", name: "Spectral", file: "Spectral-Regular.ttf", licence: "spectral-OFL.txt", role: "serif", source: "https://github.com/productiontype/Spectral" },
  { id: "nunito", name: "Nunito", file: "Nunito-wght.ttf", licence: "nunito-OFL.txt", role: "rounded", source: "https://github.com/googlefonts/nunito" },
  { id: "caveat", name: "Caveat", file: "Caveat-wght.ttf", licence: "caveat-OFL.txt", role: "handwriting", source: "https://github.com/googlefonts/caveat" },
  { id: "silkscreen", name: "Silkscreen", file: "Silkscreen-Regular.ttf", licence: "silkscreen-OFL.txt", role: "pixel", source: "https://github.com/googlefonts/silkscreen" },
];

// Basic Latin, Latin-1, Latin Extended-A and the usual punctuation.
const CHARSET = [];
for (const [from, to] of [[0x20, 0x7e], [0xa0, 0xff], [0x100, 0x17f]]) for (let c = from; c <= to; c++) CHARSET.push(c);
CHARSET.push(0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2022, 0x2026, 0x2039, 0x203a, 0x20ac, 0x2122);

function main(sourceDir, outDir) {
  for (const spec of FONTS) {
    const font = open(fs.readFileSync(path.join(sourceDir, spec.file)));
    const k = 1000 / font.unitsPerEm;
    const hhea = font.tables.hhea;
    const os2 = font.tables["OS/2"];
    const version = os2.readUInt16BE(0);
    const glyphs = {};
    for (const code of CHARSET) {
      const gid = font.cmap.get(code);
      if (!gid) continue;
      glyphs[String.fromCodePoint(code)] = [Math.round(font.advance(gid) * k), toPath(font.contours(gid), font.unitsPerEm)];
    }
    const licence = fs.readFileSync(path.join(sourceDir, spec.licence), "utf8").split(String.fromCharCode(13)).join("");
    const copyright = licence.split(String.fromCharCode(10))[0].trim();
    const data = {
      id: spec.id,
      name: spec.name,
      role: spec.role,
      source: spec.source,
      licence: "OFL-1.1",
      copyright,
      em: 1000,
      ascent: Math.round(hhea.readInt16BE(4) * k),
      descent: Math.round(-hhea.readInt16BE(6) * k),
      capHeight: version >= 2 ? Math.round(os2.readInt16BE(88) * k) : Math.round(700),
      xHeight: version >= 2 ? Math.round(os2.readInt16BE(86) * k) : Math.round(500),
      glyphs,
    };
    const folder = path.join(outDir, spec.id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "glyphs.json"), JSON.stringify(data) + String.fromCharCode(10));
    fs.writeFileSync(path.join(folder, "OFL.txt"), licence);
    const woff = toWoff(subsetTables(font, CHARSET), 0x00010000);
    fs.writeFileSync(path.join(folder, "subset.woff.b64"), woff.toString("base64") + String.fromCharCode(10));
    console.log(`${spec.id.padEnd(11)} ${String(Object.keys(glyphs).length).padStart(3)} characters, outlines ${(fs.statSync(path.join(folder, "glyphs.json")).size / 1024).toFixed(1)} KB, embedded ${(woff.length / 1024).toFixed(1)} KB`);
  }
}

if (require.main === module) {
  if (!process.argv[2]) {
    console.error("Usage: node scripts/build-fonts.cjs <folder with the downloaded fonts>");
    process.exit(2);
  }
  main(path.resolve(process.argv[2]), path.join(__dirname, "..", "fonts"));
}

module.exports = { FONTS, CHARSET };
