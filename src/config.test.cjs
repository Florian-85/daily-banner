const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validate, readConfigFile, ConfigError } = require("./lib/config.cjs");

const bad = (input, pattern) => assert.throws(() => validate(input), error => error instanceof ConfigError && pattern.test(error.message), JSON.stringify(input));

test("a name alone is a valid configuration and gets neutral defaults", () => {
  const config = validate({ name: "Ada" });
  assert.equal(config.theme, "dark");
  assert.equal(config.lang, "en");
  assert.equal(config.mascot, "cat");
  assert.deepEqual(config.packs, ["core", "geek-days"]);
  assert.deepEqual(config.headline, ["Hello, world!"]);
});

test("rejects what it does not understand, with a message that names the fix", () => {
  bad({}, /"name" is required/);
  bad("name", /JSON object/);
  bad({ name: "Ada", colour: "red" }, /Unknown option "colour"/);
  bad({ name: "" }, /can not be empty/);
  bad({ name: 12 }, /text between quotes/);
  bad({ name: "x".repeat(33) }, /too long/);
  bad({ name: "Ada\nLovelace" }, /control character/);
  bad({ name: "Ada", theme: "blue" }, /"theme" must be one of "dark", "light"/);
  bad({ name: "Ada", lang: "de" }, /"lang" must be one of/);
  bad({ name: "Ada", headline: [] }, /at least one phrase/);
  bad({ name: "Ada", headline: "one" }, /must be a list/);
  bad({ name: "Ada", headline: ["x".repeat(49)] }, /too long/);
  bad({ name: "Ada", headline: Array(9).fill("a") }, /8 at most/);
  bad({ name: "Ada", timezone: "Mars/Olympus" }, /not a known time zone/);
  bad({ name: "Ada", surprise: "yes" }, /true or false/);
  bad({ name: "Ada", mascot: "dog" }, /"mascot" must be one of/);
  bad({ name: "Ada", days: [{ date: "02-30", scene: "pi" }] }, /real day/);
  bad({ name: "Ada", days: [{ date: "13-01", scene: "pi" }] }, /real day/);
  bad({ name: "Ada", days: [{ date: "03-14" }] }, /needs a "scene"/);
  bad({ name: "Ada", days: [{ date: "03-14", scene: "pi", colour: 1 }] }, /unknown option/);
});

test("accepts special characters, accents, emoji and a leap day", () => {
  const config = validate({ name: "Zoë <O'Brien> & Co", headline: ["Ça va ? 🚀", "\"quoted\""], days: [{ date: "02-29", theme: "funky" }] });
  assert.equal(config.name, "Zoë <O'Brien> & Co");
  assert.equal(config.days[0].date, "02-29");
});

test("collapses whitespace and trims", () => {
  assert.equal(validate({ name: "  Ada    Lovelace " }).name, "Ada Lovelace");
});

test("a mascot file must stay inside the folder of the configuration", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "db-config-"));
  assert.equal(validate({ name: "A", mascot: { file: "m.json" } }, { directory }).mascot.file, path.join(directory, "m.json"));
  for (const file of ["../m.json", "/etc/passwd", "C:\\secret.json", "a/../../m.json", "", 3]) {
    assert.throws(() => validate({ name: "A", mascot: { file } }, { directory }), ConfigError, String(file));
  }
  assert.throws(() => validate({ name: "A", mascot: { file: "m.json", extra: 1 } }, { directory }), ConfigError);
});

test("reads a file, tolerates a BOM, and explains missing or broken files", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "db-config-"));
  const file = path.join(directory, "daily-banner.json");
  fs.writeFileSync(file, '\uFEFF{ "name": "Ada" }');
  assert.equal(readConfigFile(file).name, "Ada");
  fs.writeFileSync(file, '{ "name": "Ada", }');
  assert.throws(() => readConfigFile(file), /not valid JSON/);
  assert.throws(() => readConfigFile(path.join(directory, "missing.json")), /not found.*daily-banner init/);
});
