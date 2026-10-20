const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildProfile, loadConfig } = require("./lib/build.cjs");

const config = loadConfig(path.join(__dirname, "config"));
const SCENES = ["none", "noel", "halloween", "anniv", "avril", "mai4", "pi"];
// Looping changes of brightness or colour. Movement (wing flaps, rotations) is not a flash.
const LUMINANCE = /<animate\s[^>]*attributeName="(?:opacity|fill|stroke|fill-opacity|stroke-opacity|stop-opacity)"[^>]*>/g;
const MIN_CYCLE_SECONDS = 0.34; // a cycle is one flash: at most 3 per second

test("no looping brightness or colour animation flashes more than 3 times per second, in any scene or theme", () => {
  let checked = 0;
  for (const scene of SCENES) {
    for (const funky of [false, true]) {
      const { files } = buildProfile(config, config.snapshot, { date: "2026-02-10", override: { scene, funky } });
      for (const [name, content] of files) {
        if (!name.endsWith(".svg")) continue;
        for (const [tag] of content.matchAll(LUMINANCE)) {
          if (!/repeatCount="indefinite"/.test(tag)) continue;
          const duration = /dur="([\d.]+)s"/.exec(tag);
          assert.ok(duration, `${name}: a looping animation needs a duration`);
          assert.ok(Number(duration[1]) >= MIN_CYCLE_SECONDS, `${name} (${scene}): ${tag.slice(0, 90)} cycles every ${duration[1]}s`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 100, "the scan really looked at the animations");
});

test("the May 4th spark pulses slowly", () => {
  const { files } = buildProfile(config, config.snapshot, { date: "2026-02-10", override: { scene: "mai4" } });
  const banner = files.get("assets/en/dark/banner.svg");
  assert.doesNotMatch(banner, /dur="\.(?:17|2)s"/);
  assert.match(banner, /values="\.15;\.55;\.15" dur="\.8s"/);
});
