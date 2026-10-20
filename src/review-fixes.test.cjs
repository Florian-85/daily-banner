// Regression tests for the review of PR #69 (each test names the finding it covers).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildProfile, loadConfig, selectionFor } = require("./lib/build.cjs");
const { isWellFormedSvg } = require("./lib/svg.cjs");
const { stackCard } = require("./lib/cards.cjs");
const { THEMES } = require("./lib/palette.cjs");
const { main } = require("./build-profile.cjs");

const config = loadConfig(path.join(__dirname, "config"));
const data = config.snapshot;
const ORDINARY = "2026-02-10";

// A date appears if it is written in full (YYYY-MM-DD) or as a stand-alone MM-DD.
const writesDate = (content, mmdd) => new RegExp(`\\d{4}-${mmdd}|(?<![\\w.,-])${mmdd}(?![\\w.])`).test(content);

function captureLog(callback) {
  const lines = [];
  const original = console.log;
  console.log = line => lines.push(String(line));
  try {
    callback();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

test("--funky works on its own and keeps the day's scene", () => {
  const alone = selectionFor(config, ORDINARY, { funky: true });
  assert.equal(alone.scene, null);
  assert.deepEqual(alone.themes, { dark: "funky-dark", light: "funky-light" });
  const onHalloween = selectionFor(config, "2026-10-31", { funky: true });
  assert.equal(onHalloween.scene, "halloween");
  assert.equal(onHalloween.funky, true);
  assert.equal(selectionFor(config, "2026-10-31", {}).funky, true, "special dates are funky by themselves");
  assert.equal(selectionFor(config, ORDINARY, {}).funky, false);

  const out = fs.mkdtempSync(path.join(os.tmpdir(), "profile-funky-"));
  captureLog(() => main(["--out", out, "--date", ORDINARY, "--funky"]));
  assert.match(fs.readFileSync(path.join(out, "assets/en/dark/banner.svg"), "utf8"), /#140B2E/);
  fs.rmSync(out, { recursive: true, force: true });
});

test("the log never names the scene of a real day, whatever the day", () => {
  const privateDates = config["calendar.private"].events.flatMap(event => event.dates);
  const days = [...privateDates.map(date => `2026-${date}`), "2026-10-31", "2026-12-25", "2026-05-04"];
  for (const date of days) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "profile-log-"));
    const log = captureLog(() => main(["--out", out, "--date", date]));
    assert.doesNotMatch(log, /anniv|halloween|noel|avril|mai4|private|prive/i, date);
    assert.ok(!writesDate(log, date.slice(5)), `the log repeats ${date.slice(5)}`);
    fs.rmSync(out, { recursive: true, force: true });
  }
  // A forced preview may print the scene: the caller asked for it.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "profile-forced-"));
  assert.match(captureLog(() => main(["--out", out, "--date", ORDINARY, "--scene", "mai4"])), /scene: mai4/);
  fs.rmSync(out, { recursive: true, force: true });
});

test("every special date uses the funky themes, an ordinary day keeps the normal ones", () => {
  for (const date of ["2026-12-25", "2026-10-31", "2026-04-01", "2026-05-04", "2026-03-14", "2026-04-19"]) {
    const selection = selectionFor(config, date);
    assert.ok(selection.scene, date);
    assert.deepEqual(selection.themes, { dark: "funky-dark", light: "funky-light" }, date);
  }
  assert.deepEqual(selectionFor(config, ORDINARY).themes, { dark: "dark", light: "light" });
});

test("no generated file or README URL contains a private date, even on that very day", () => {
  const privateDates = config["calendar.private"].events.flatMap(event => event.dates);
  for (const mmdd of privateDates) {
    const { files } = buildProfile(config, data, { date: `2026-${mmdd}` });
    for (const [name, content] of files) assert.ok(!writesDate(content, mmdd), `${name} writes ${mmdd}`);
  }
  // Same check with a synthetic private event, independent from the real dates.
  const fake = { ...config, "calendar.private": { events: [{ id: "x", scene: "anniv", theme: "funky", dates: ["03-03"] }] } };
  const { files, selection } = buildProfile(fake, data, { date: "2026-03-03" });
  assert.equal(selection.scene, "anniv");
  for (const [name, content] of files) assert.ok(!writesDate(content, "03-03"), `${name} writes the date`);
  assert.match(files.get("README.md"), /\?v=[0-9a-f]{10}"/);
});

test("the cache version follows the content, not the date", () => {
  const one = buildProfile(config, data, { date: "2026-02-10" }).files.get("README.md");
  const two = buildProfile(config, data, { date: "2026-02-11" }).files.get("README.md");
  assert.equal(one, two, "an ordinary day must not change the README");
  const changed = buildProfile(config, { ...data, duolingo: { ...data.duolingo, xp: data.duolingo.xp + 1 } }, { date: "2026-02-10" }).files.get("README.md");
  assert.notEqual(one, changed);
});

test("rejects impossible dates, with and without a forced scene", () => {
  for (const date of ["2026-13-01", "2026-02-31", "2026-00-10", "2026-04-31", "2026-1-1"]) {
    assert.throws(() => buildProfile(config, data, { date }), /Invalid date/, date);
    assert.throws(() => buildProfile(config, data, { date, override: { scene: "noel" } }), /Invalid date/, `${date} (forced scene)`);
  }
  assert.doesNotThrow(() => buildProfile(config, data, { date: "2028-02-29" }));
  assert.throws(() => buildProfile(config, data, { date: "2026-02-29" }), /Invalid date/);
});

test("language pills wrap inside the viewBox and the card grows", () => {
  const stack = { rows: { languages: ["Python", "TypeScript", "JavaScript", "PHP", "Shell", "Go", "Rust", "Java", "C#", "Kotlin", "Swift", "Ruby", "Dart"] } };
  const i18n = { stackRows: { languages: "LANGUAGES" }, stackItems: {} };
  const svg = stackCard(THEMES.dark, i18n, stack);
  assert.ok(isWellFormedSvg(svg));
  const height = Number(/<svg width="900" height="(\d+)"/.exec(svg)[1]);
  assert.ok(height > 24 + 50, "the card must grow when a row wraps");
  const pills = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="26"/g)];
  assert.equal(pills.length, stack.rows.languages.length);
  for (const [, x, y, width] of pills) {
    assert.ok(Number(x) + Number(width) <= 900, `pill at x=${x} overflows`);
    assert.ok(Number(y) + 26 <= height, `pill at y=${y} is below the card`);
  }
  const lines = new Set(pills.map(([, , y]) => y));
  assert.ok(lines.size >= 2, "a long row must use several lines");
});

test("the mascot is configuration: an empty constellation is refused, a custom one is used", () => {
  const custom = { ...config, mascot: { name: "star", points: [[100, 100, 6]], outline: [], stripes: [] } };
  const { files } = buildProfile(custom, data, { date: ORDINARY });
  assert.ok(isWellFormedSvg(files.get("assets/en/dark/banner.svg")));
  assert.throws(() => buildProfile({ ...config, mascot: null }, data, { date: ORDINARY }), /mascot/i);
});

test("Halloween is a bloody B with a knife through it (no spider web on the letter)", () => {
  const banner = buildProfile(config, data, { date: "2026-10-31" }).files.get("assets/en/dark/banner.svg");
  assert.match(banner, /#C1121F/);
  assert.match(banner, /Happy Halloween!/);
  assert.match(banner, /#C9CDD6/, "the steel blade is drawn");
  assert.doesNotMatch(banner, /M0,0 q5,-4 9,2/);
  assert.ok(isWellFormedSvg(banner));
});
