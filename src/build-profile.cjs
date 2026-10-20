"use strict";
// Generates the whole public profile into a local folder. Offline: it reads config/ only.
//
//   node services/github-profile/build-profile.cjs --out ./out [--date 2026-10-31] [--scene halloween] [--funky]
//
// --scene forces a scene (noel, halloween, halloween-witch, anniv, avril, mai4, pi, none) to preview it any day.
// --funky switches to the funky themes, with or without --scene.

const fs = require("node:fs");
const path = require("node:path");
const { buildProfile, loadConfig } = require("./lib/build.cjs");

function parseArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--funky") options.funky = true;
    else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++i];
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const out = options.out;
  if (!out) throw new Error("--out <directory> is required.");
  const config = loadConfig(path.join(__dirname, "config"));
  if (!config.snapshot) throw new Error("config/snapshot.json is required for an offline build.");
  const date = options.date || new Date().toISOString().slice(0, 10);
  const override = {};
  if (options.scene) override.scene = options.scene;
  if (options.funky) override.funky = true;
  const { files, selection } = buildProfile(config, config.snapshot, { date, override });
  for (const [relative, content] of files) {
    const target = path.join(out, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  // The scene name is printed only when the caller forced it: on a real day it could name a private date.
  const scene = options.scene ? selection.scene ?? "none" : selection.scene ? "special" : "none";
  console.log(`${files.size} files written to ${out} (scene: ${scene}, themes: ${selection.themes.dark}/${selection.themes.light}).`);
}

module.exports = { main, parseArguments };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
