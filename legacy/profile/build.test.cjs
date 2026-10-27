const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildProfile, loadConfig, selectionFor } = require("./lib/build.cjs");
const { isWellFormedSvg } = require("./lib/svg.cjs");
const { duration, sizeLevel, formatNumber } = require("./lib/cards.cjs");
const { main, parseArguments } = require("./build-profile.cjs");

const config = loadConfig(path.join(__dirname, "config"));
const data = config.snapshot;
const DATE = "2026-02-10"; // an ordinary day
const shown = config.projects.projects.filter(project => project.shown);

test("builds both languages and both modes with valid SVG", () => {
  const { files, selection } = buildProfile(config, data, { date: DATE });
  assert.equal(selection.scene, null);
  assert.deepEqual(selection.themes, { dark: "dark", light: "light" });
  const images = [...files.keys()].filter(name => name.endsWith(".svg"));
  assert.equal(images.length, 2 * 2 * (7 + shown.length));
  for (const name of images) assert.ok(isWellFormedSvg(files.get(name)), name);
  assert.ok(files.has("README.md") && files.has("README.fr.md"));
});

test("the default language owns README.md and links to the other one", () => {
  const { files } = buildProfile(config, data, { date: DATE, version: "v1" });
  assert.match(files.get("README.md"), /Version française/);
  assert.match(files.get("README.md"), /href="\.\/README\.fr\.md"/);
  assert.match(files.get("README.fr.md"), /href="\.\/README\.md"/);
  assert.match(files.get("README.md"), /assets\/en\/dark\/banner\.svg\?v=v1/);
});

test("README and images only reference the projects marked as shown", () => {
  const { files } = buildProfile(config, data, { date: DATE });
  const readme = files.get("README.md");
  for (const project of config.projects.projects) {
    assert.equal(readme.includes(`card-${project.id}.svg`), project.shown, project.id);
    assert.equal(files.has(`assets/en/dark/card-${project.id}.svg`), project.shown, project.id);
  }
});

test("every special scene renders valid SVG in all themes", () => {
  for (const scene of ["noel", "halloween", "anniv", "avril", "mai4", "pi"]) {
    const { files } = buildProfile(config, data, { date: DATE, override: { scene, funky: scene === "anniv" } });
    for (const lang of ["en", "fr"]) {
      for (const mode of ["dark", "light"]) assert.ok(isWellFormedSvg(files.get(`assets/${lang}/${mode}/banner.svg`)), `${scene} ${lang} ${mode}`);
    }
  }
});

test("scenes change the banner text as designed", () => {
  const banner = scene => buildProfile(config, data, { date: DATE, override: { scene } }).files.get("assets/fr/dark/banner.svg");
  assert.match(banner("avril"), /sudo fais-moi un sandwich/);
  assert.match(banner("pi"), /3,14159265358979/);
  assert.doesNotMatch(banner("pi"), /Bonne journée du Pi/);
  assert.match(banner("mai4"), /#B26BFF/);
  assert.match(banner("mai4"), /#FF2B2B/);
  assert.doesNotMatch(banner("none"), /Poisson d'avril/);
});

test("a funky day uses the funky palettes for the dark and light images", () => {
  const { files, selection } = buildProfile(config, data, { date: DATE, override: { scene: "none", funky: true } });
  assert.deepEqual(selection.themes, { dark: "funky-dark", light: "funky-light" });
  assert.match(files.get("assets/en/dark/banner.svg"), /#140B2E/);
  assert.match(files.get("assets/en/light/banner.svg"), /#D2C6FF/);
});

test("private dates never appear in the generated files", () => {
  const dates = config["calendar.private"].events.flatMap(event => event.dates);
  assert.ok(dates.length > 0);
  for (const scene of ["none", "anniv"]) {
    const { files } = buildProfile(config, data, { date: DATE, override: { scene, funky: scene === "anniv" } });
    for (const [name, content] of files) {
      assert.doesNotMatch(content, /anniversaire|birthday/i, name);
      for (const date of dates) assert.ok(!content.includes(date), `${name} contains a private date`);
    }
  }
  const fake = { ...config, "calendar.private": { events: [{ id: "x", scene: "anniv", theme: "funky", dates: ["03-03"] }] } };
  assert.equal(selectionFor(fake, "2026-03-03").scene, "anniv");
  assert.equal(selectionFor(config, "2026-03-03").scene, null);
});

test("fails clearly on an unknown scene or missing project data", () => {
  assert.throws(() => buildProfile(config, data, { date: DATE, override: { scene: "nope" } }), /Unknown scene/);
  const missing = { ...data, projects: {} };
  assert.throws(() => buildProfile(config, missing, { date: DATE }), /No data for project/);
  assert.throws(() => buildProfile(config, data, {}), /date/);
});

test("the build is deterministic for a given day", () => {
  const first = buildProfile(config, data, { date: "2026-12-25" }).files;
  const second = buildProfile(config, data, { date: "2026-12-25" }).files;
  for (const [name, content] of first) assert.equal(second.get(name), content, name);
});

test("card helpers: duration units, size level and number grouping", () => {
  const labels = { weeks: ["week", "weeks"], months: ["month", "months"], years: ["year", "years"] };
  assert.equal(duration({ created: "2026-10-13", pushed: "2026-10-20" }, labels), "1 week");
  assert.equal(duration({ created: "2026-09-16", pushed: "2026-10-20" }, labels), "5 weeks");
  assert.equal(duration({ created: "2026-02-12", pushed: "2026-10-19" }, labels), "8 months");
  assert.equal(duration({ created: "2023-01-01", pushed: "2026-01-01" }, labels), "3 years");
  assert.deepEqual([100000, 300000, 900000, 1500000, 3000000].map(sizeLevel), [1, 2, 3, 4, 5]);
  assert.equal(formatNumber(17556, "en"), "17,556");
  assert.equal(formatNumber(17556, "fr"), "17 556");
});

test("the command line writes every file and prints no private identifier", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "profile-"));
  const lines = [];
  const original = console.log;
  console.log = line => lines.push(line);
  try {
    main(["--out", out, "--date", "2026-04-19"]);
  } finally {
    console.log = original;
  }
  assert.match(lines[0], /files written/);
  assert.doesNotMatch(lines[0], /private|prive|04-19/);
  assert.ok(fs.existsSync(path.join(out, "README.md")));
  assert.ok(fs.existsSync(path.join(out, "assets/en/dark/banner.svg")));
  assert.throws(() => parseArguments(["oops"]), /Unexpected/);
  assert.throws(() => main([]), /--out/);
  fs.rmSync(out, { recursive: true, force: true });
});
