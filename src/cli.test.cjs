const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const bin = path.join(root, "bin", "daily-banner.cjs");
const run = (args, options = {}) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", ...options });
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-cli-"));

test("init writes a starter configuration that generates a banner, and never overwrites", () => {
  const cwd = temp();
  const init = run(["init"], { cwd });
  assert.equal(init.status, 0, init.stderr);
  assert.ok(fs.existsSync(path.join(cwd, "daily-banner.json")));
  const again = run(["init"], { cwd });
  assert.equal(again.status, 2);
  assert.match(again.stderr, /already exists/);
  const generated = run(["generate", "--out", "assets", "--date", "2026-02-10"], { cwd });
  assert.equal(generated.status, 0, generated.stderr);
  for (const file of ["daily-banner.svg", "daily-banner-dark.svg", "daily-banner-light.svg"]) assert.ok(fs.existsSync(path.join(cwd, "assets", file)), file);
});

test("generate is the default command and works with paths that contain spaces, accents and nesting", () => {
  const cwd = temp();
  const folder = path.join(cwd, "mon dossier é");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "ma config.json"), JSON.stringify({ name: "Zoë" }));
  const result = run(["--config", path.join(folder, "ma config.json"), "--out", path.join(cwd, "a b", "c d"), "--date=2026-02-10"], { cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(cwd, "a b", "c d", "daily-banner.svg")));
});

test("the same command twice writes the same bytes", () => {
  const cwd = temp();
  fs.writeFileSync(path.join(cwd, "daily-banner.json"), JSON.stringify({ name: "Ada Lovelace", headline: ["One", "Two"] }));
  run(["--out", "a", "--date", "2026-10-31"], { cwd });
  run(["--out", "b", "--date", "2026-10-31"], { cwd });
  for (const file of fs.readdirSync(path.join(cwd, "a"))) {
    assert.deepEqual(fs.readFileSync(path.join(cwd, "a", file)), fs.readFileSync(path.join(cwd, "b", file)), file);
  }
});

test("failures are short, say what to do, and set the exit code", () => {
  const cwd = temp();
  const missing = run([], { cwd });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Configuration file not found/);
  fs.writeFileSync(path.join(cwd, "daily-banner.json"), '{ "name": "Ada", "theme": "pink" }');
  const invalid = run([], { cwd });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /"theme" must be one of/);
  assert.doesNotMatch(invalid.stderr, /\n\s+at /, "no stack trace for a user mistake");
  fs.writeFileSync(path.join(cwd, "daily-banner.json"), '{ "name": "Ada" }');
  assert.match(run(["--date", "2026-02-31"], { cwd }).stderr, /not a real calendar day/);
  assert.match(run(["--date", "tomorrow"], { cwd }).stderr, /Invalid date/);
  assert.match(run(["--scene", "bogus"], { cwd }).stderr, /Unknown scene "bogus"/);
  assert.equal(run(["--bogus"], { cwd }).status, 2);
  assert.equal(run(["--date"], { cwd }).status, 2);
  assert.equal(run(["frobnicate"], { cwd }).status, 2);
});

test("inside GitHub Actions a failure becomes an annotation", () => {
  const cwd = temp();
  const result = run([], { cwd, env: { ...process.env, GITHUB_ACTIONS: "true" } });
  assert.match(result.stdout, /^::error title=daily-banner::Configuration file not found/m);
});

test("the scene of a real day is never printed, only a forced one", () => {
  const cwd = temp();
  fs.writeFileSync(path.join(cwd, "daily-banner.json"), JSON.stringify({ name: "Ada", days: [{ date: "04-19", scene: "birthday" }] }));
  const real = run(["--date", "2026-04-19"], { cwd });
  assert.match(real.stdout, /scene: special/);
  assert.doesNotMatch(real.stdout, /birthday/);
  assert.match(run(["--scene", "pi", "--date", "2026-04-19"], { cwd }).stdout, /scene: pi/);
});

test("--help, --version and scenes", () => {
  assert.match(run(["--help"]).stdout, /Usage:/);
  assert.match(run(["--version"]).stdout.trim(), /^\d+\.\d+\.\d+$/);
  const scenes = run(["scenes"]).stdout;
  for (const word of ["noel", "halloween", "april-fools", "core", "geek-days", "holidays-fr"]) assert.match(scenes, new RegExp(word));
});
