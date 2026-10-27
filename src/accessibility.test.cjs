const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate } = require("./lib/config.cjs");
const { generate } = require("./lib/generate.cjs");
const { SCENE_IDS } = require("./lib/scenes.cjs");

// Looping changes of brightness or colour. Movement (wing flaps, rotations) is not a flash.
const LUMINANCE = /<animate\s[^>]*attributeName="(?:opacity|fill|stroke|fill-opacity|stroke-opacity|stop-opacity)"[^>]*>/g;
const MIN_CYCLE_SECONDS = 0.34; // a cycle is one flash: at most 3 per second

test("no looping brightness or colour animation flashes more than 3 times per second, in any scene, mascot or theme", () => {
  let checked = 0;
  for (const mascot of ["cat", "stars", "none"]) {
    for (const scene of ["none", ...SCENE_IDS]) {
      for (const funky of [false, true]) {
        const { files } = generate(validate({ name: "Ada Lovelace", mascot, location: "Here", subtitle: "Hi" }), { date: "2026-02-10", scene, funky });
        for (const [name, content] of files) {
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
  }
  assert.ok(checked > 100, "the scan really looked at the animations");
});

test("every banner carries a text alternative", () => {
  const { files } = generate(validate({ name: "Ada Lovelace", alt: "Ada's profile banner" }), { date: "2026-02-10" });
  for (const content of files.values()) {
    assert.match(content, /role="img" aria-label="Ada&#39;s profile banner"/);
    assert.match(content, /<title>Ada&#39;s profile banner<\/title>/);
  }
});
