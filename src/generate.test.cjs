const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validate } = require("./lib/config.cjs");
const { generate, today, OUTPUT } = require("./lib/generate.cjs");
const { isWellFormedSvg } = require("./lib/svg.cjs");
const { SCENE_IDS } = require("./lib/scenes.cjs");
const { layoutName } = require("./lib/layout.cjs");

const example = () => validate(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "daily-banner.json"), "utf8")));
const ORDINARY = "2026-02-10";
const svgs = result => [...result.files.values()];

test("writes the three files, each a well-formed SVG", () => {
  const { files } = generate(example(), { date: ORDINARY });
  assert.deepEqual([...files.keys()].sort(), Object.values(OUTPUT).sort());
  for (const [name, content] of files) assert.ok(isWellFormedSvg(content), name);
  assert.equal(files.get(OUTPUT.main), files.get(OUTPUT.dark), "dark is the default theme");
  assert.notEqual(files.get(OUTPUT.dark), files.get(OUTPUT.light));
  assert.equal(generate({ ...example(), theme: "light" }, { date: ORDINARY }).files.get(OUTPUT.main), files.get(OUTPUT.light));
});

test("is deterministic: same configuration and date, same bytes; another day, another picture", () => {
  const first = generate(example(), { date: ORDINARY }).files.get(OUTPUT.main);
  assert.equal(generate(example(), { date: ORDINARY }).files.get(OUTPUT.main), first);
  assert.notEqual(generate(example(), { date: "2026-02-11" }).files.get(OUTPUT.main), first, "the headline order moves every day");
});

test("every scene renders, in both modes and for every mascot, without leftovers", () => {
  for (const mascot of ["cat", "stars", "none"]) {
    for (const scene of SCENE_IDS) {
      const result = generate({ ...example(), mascot }, { date: ORDINARY, scene, funky: true });
      assert.equal(result.selection.scene, scene, `${scene}/${mascot}`);
      for (const content of svgs(result)) {
        assert.ok(isWellFormedSvg(content), `${scene}/${mascot}`);
        assert.doesNotMatch(content, /undefined|NaN|\[object/, `${scene}/${mascot}`);
      }
    }
  }
});

test("the calendar picks the scene of the day, and funky themes on special days", () => {
  const christmas = generate(example(), { date: "2026-12-25" });
  assert.deepEqual(christmas.selection.themes, { dark: "funky-dark", light: "funky-light" });
  assert.equal(christmas.selection.scene, "noel");
  assert.equal(generate(example(), { date: "2026-10-31" }).selection.scene, "halloween");
  assert.equal(generate(example(), { date: "2026-03-14" }).selection.scene, "pi");
  assert.equal(generate(example(), { date: ORDINARY }).selection.scene, null);
});

test("excluded scenes keep the funky theme but lose the animation", () => {
  const result = generate({ ...example(), exclude: ["halloween"] }, { date: "2026-10-31" });
  assert.equal(result.selection.scene, null);
  assert.equal(result.selection.themes.dark, "funky-dark");
});

test("packs are opt-in: French holidays only with the holidays-fr pack", () => {
  assert.equal(generate(example(), { date: "2026-07-14" }).selection.themes.dark, "dark");
  assert.equal(generate({ ...example(), packs: ["holidays-fr"] }, { date: "2026-07-14" }).selection.themes.dark, "funky-dark");
  assert.throws(() => generate({ ...example(), packs: ["nope"] }, { date: ORDINARY }), /Unknown pack "nope"/);
});

test("personal days work and the output never says which date it is", () => {
  const config = { ...example(), days: [{ date: "04-19", scene: "birthday" }], surprise: false };
  const result = generate(config, { date: "2026-04-19" });
  assert.equal(result.selection.scene, "birthday");
  for (const content of svgs(result)) assert.doesNotMatch(content, /04-19|2026/);
  assert.throws(() => generate({ ...example(), days: [{ date: "04-19", scene: "nope" }] }, { date: ORDINARY }), /Unknown scene "nope"/);
});

test("rejects impossible dates and unknown forced scenes", () => {
  assert.throws(() => generate(example(), { date: "2026-02-31" }), /not a real calendar day/);
  assert.throws(() => generate(example(), { date: "10/31/2026" }), /Invalid date/);
  assert.throws(() => generate(example(), {}), /date.*required/);
  assert.throws(() => generate(example(), { date: ORDINARY, scene: "bogus" }), /Unknown scene "bogus"/);
});

test("hostile text can not inject markup", () => {
  const config = validate({ name: '"><script>a</script> & <b>', headline: ["<img src=x onerror=alert(1)>", "a & b < c"], subtitle: "</text><script/>", location: "'\"<>&", alt: "<svg onload=x>" });
  for (const scene of [undefined, ...SCENE_IDS]) {
    for (const content of svgs(generate(config, { date: ORDINARY, scene }))) {
      assert.ok(isWellFormedSvg(content));
      assert.doesNotMatch(content, /<(?:script|img|b|foreignObject)[\s>/]/i);
      assert.doesNotMatch(content, /javascript:/i);
      // Attribute names only: the text of a label may legitimately contain "onload=" once escaped.
      for (const [tag] of content.matchAll(/<[A-Za-z][^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>/g)) {
        assert.doesNotMatch(tag.replace(/"[^"]*"|'[^']*'/g, ""), /\son[a-z]+\s*=/i, tag.slice(0, 80));
      }
      assert.doesNotMatch(content, /\bhref=|xlink:/, "no external reference at all");
    }
  }
});

test("names of any shape stay inside the room before the mascot", () => {
  const names = ["A", "Cher", "Ada Lovelace", "Jean-Baptiste Poquelin Molière", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii", "Åsa Öberg-Ñandú", "山田 太郎", "Zoë 🚀", "a b c d e f g h i j k l m n o p"];
  for (const name of names) {
    for (const maxWidth of [610, 800]) {
      const layout = layoutName(validate({ name }).name, { maxWidth });
      const end = layout.anchors["name.end"].x;
      assert.ok(layout.size >= 28 && layout.size <= 54, name);
      if (!layout.fits) {
        assert.equal(name, "W".repeat(32), "only a pathological name does not fit");
        assert.throws(() => generate(validate({ name }), { date: ORDINARY }), /too wide/);
        continue;
      }
      assert.ok(end <= 48 + maxWidth + 4, `${name}: ends at ${end}`);
      const initial = layout.anchors["name.initial"];
      assert.ok(initial.left >= 48 && initial.right > initial.left, name);
    }
  }
});

test("highlights the initial of the last word, or of the first on request; one word falls back to its first letter", () => {
  assert.equal(layoutName("Ada Lovelace", { maxWidth: 610 }).pieces.initial.text, "L");
  assert.equal(layoutName("Ada Lovelace", { highlight: "first", maxWidth: 610 }).pieces.initial.text, "A");
  assert.equal(layoutName("Cher", { maxWidth: 610 }).pieces.initial.text, "C");
  assert.equal(layoutName("Éric", { maxWidth: 610 }).pieces.initial.text, "É");
  assert.equal(layoutName("🚀rocket", { maxWidth: 610 }).pieces.initial.text, "🚀");
});

test("a custom constellation mascot works and brings its own anchors", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "db-mascot-"));
  const file = path.join(directory, "mascot.json");
  fs.writeFileSync(file, JSON.stringify({ points: [[20, 20, 4], [180, 30, 4], [100, 180, 5]], outline: [[0, 1], [1, 2], [2, 0]], anchors: { "head-top": [100, 20], mouth: [100, 120] } }));
  const config = validate({ name: "Ada", mascot: { file: "mascot.json" } }, { directory });
  const april = generate(config, { date: ORDINARY, scene: "april-fools" });
  assert.match(april.files.get(OUTPUT.main), /stroke="#FFC857"/, "the snorkel found the declared mouth anchor");
  const broken = [{ points: [] }, { points: [[1, 2]] }, { points: [[0, 0, 3], [999, 0, 3]] }, { points: [[0, 0, 3], [1, 1, 3]], outline: [[0, 5]] }, { points: [[0, 0, 3], [1, 1, 3]], anchors: { "Bad Name": [1, 1] } }, null];
  for (const content of broken) {
    fs.writeFileSync(file, JSON.stringify(content));
    assert.throws(() => generate(config, { date: ORDINARY }), /Mascot file/);
  }
  fs.rmSync(file);
  assert.throws(() => generate(config, { date: ORDINARY }), /file not found/);
});

test("a constellation without declared anchors still gets the bounding-box ones", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "db-mascot-"));
  fs.writeFileSync(path.join(directory, "m.json"), JSON.stringify({ points: [[20, 20, 4], [180, 30, 4]] }));
  const config = validate({ name: "Ada", mascot: { file: "m.json" } }, { directory });
  for (const scene of SCENE_IDS) assert.ok(isWellFormedSvg(generate(config, { date: ORDINARY, scene }).files.get(OUTPUT.main)), scene);
});

test("today() follows the configured time zone", () => {
  const instant = new Date("2026-12-31T23:30:00Z");
  assert.equal(today("UTC", instant), "2026-12-31");
  assert.equal(today("Europe/Paris", instant), "2027-01-01");
  assert.equal(today("America/Los_Angeles", instant), "2026-12-31");
});

test("nothing personal or branded is left in any output", () => {
  const forbidden = /florian|thekingadn|homelab|badger|snitch|hufflepuff|poufsouffle|star wars|saber|sabre|duolingo|\.private/i;
  for (const mascot of ["cat", "stars"]) {
    for (const scene of [undefined, ...SCENE_IDS]) {
      for (const content of svgs(generate({ ...example(), mascot }, { date: ORDINARY, scene }))) assert.doesNotMatch(content, forbidden);
    }
  }
});

test("the preview images shown in the README match what the generator draws today", () => {
  const folder = path.join(__dirname, "..", "docs", "img");
  const config = example();
  const shots = [["default", "2026-02-10", undefined], ["christmas", "2026-12-25", "noel"], ["halloween", "2026-10-31", "halloween"], ["april-fools", "2026-04-01", "april-fools"], ["birthday", "2026-03-03", "birthday"], ["pi-day", "2026-03-14", "pi"]];
  let compared = 0;
  for (const [name, date, scene] of shots) {
    const { files } = generate(config, { date, scene });
    for (const mode of ["dark", "light"]) {
      const file = path.join(folder, `${name}-${mode}.svg`);
      if (!fs.existsSync(file)) continue;
      assert.equal(fs.readFileSync(file, "utf8"), files.get(`daily-banner-${mode}.svg`), `${name}-${mode}.svg is stale: run npm run build:examples`);
      compared += 1;
    }
  }
  assert.ok(compared >= 7, "the README images exist");
});
