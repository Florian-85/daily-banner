"use strict";
// Regenerates the preview images used by the README into docs/img/ (deterministic: same files every time).
const fs = require("node:fs");
const path = require("node:path");
const { validate } = require("../src/lib/config.cjs");
const { generate } = require("../src/lib/generate.cjs");

const config = validate(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "daily-banner.json"), "utf8")));
const out = path.join(__dirname, "..", "docs", "img");
fs.mkdirSync(out, { recursive: true });
const shots = [
  ["default", "2026-02-10", undefined, ["dark", "light"]],
  ["christmas", "2026-12-25", "noel", ["dark"]],
  ["halloween", "2026-10-31", "halloween", ["dark"]],
  ["april-fools", "2026-04-01", "april-fools", ["dark"]],
  ["birthday", "2026-03-03", "birthday", ["dark"]],
  ["pi-day", "2026-03-14", "pi", ["dark"]],
];
for (const [name, date, scene, modes] of shots) {
  const { files } = generate(config, { date, scene });
  for (const mode of modes) fs.writeFileSync(path.join(out, `${name}-${mode}.svg`), files.get(`daily-banner-${mode}.svg`));
}
console.log(`Examples written to ${path.relative(process.cwd(), out)}`);
