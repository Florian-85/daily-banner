#!/usr/bin/env node
"use strict";
// daily-banner: generates the animated banner files for a README.
//
//   daily-banner generate --config daily-banner.json --out assets [--date 2026-10-31] [--scene halloween] [--funky]
//   daily-banner init [--config daily-banner.json]
//   daily-banner scenes

const fs = require("node:fs");
const path = require("node:path");
const { readConfigFile, ConfigError } = require("./lib/config.cjs");
const { generate, today, OUTPUT } = require("./lib/generate.cjs");
const { SCENES, SCENE_IDS } = require("./lib/scenes.cjs");
const { availablePacks } = require("./lib/packs.cjs");
const { parseDate } = require("./lib/calendar.cjs");
const pkg = require("../package.json");

const USAGE = `daily-banner ${pkg.version}

Usage:
  daily-banner generate [--config daily-banner.json] [--out assets] [--date YYYY-MM-DD] [--scene <id|none>] [--funky]
  daily-banner init     [--config daily-banner.json]   write a starter configuration
  daily-banner scenes                                    list the scenes and packs
  daily-banner --help | --version

generate writes ${Object.values(OUTPUT).join(", ")} into --out.
--date defaults to today in the configured time zone; --scene and --funky preview a scene on any day.`;

const STARTER = {
  name: "Your Name",
  headline: ["Developer", "Open source fan", "Cat person"],
  subtitle: "Hello! I build things and write about them.",
  location: "Somewhere · Earth",
  theme: "dark",
};

class UsageError extends Error {}

function parseArguments(argv) {
  const options = { flags: new Set() };
  const valued = ["config", "out", "date", "scene"];
  const booleans = ["funky", "help", "version"];
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [name, inline] = argument.slice(2).split(/=(.*)/s, 2);
    if (booleans.includes(name)) options.flags.add(name);
    else if (valued.includes(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`--${name} needs a value.`);
      options[name] = value;
    } else throw new UsageError(`Unknown option --${name}.`);
  }
  if (positional.length > 1) throw new UsageError(`Unexpected argument: ${positional[1]}.`);
  options.command = positional[0] ?? "generate";
  return options;
}

function main(argv = process.argv.slice(2), { log = console.log, now = new Date() } = {}) {
  const options = parseArguments(argv);
  if (options.flags.has("help")) return log(USAGE);
  if (options.flags.has("version")) return log(pkg.version);
  const configFile = options.config ?? "daily-banner.json";

  if (options.command === "init") {
    if (fs.existsSync(configFile)) throw new UsageError(`${configFile} already exists: not overwritten.`);
    fs.writeFileSync(configFile, `${JSON.stringify(STARTER, null, 2)}\n`);
    return log(`Wrote ${configFile}. Edit it, then run: daily-banner generate --out assets`);
  }
  if (options.command === "scenes") {
    log(`Scenes: ${SCENE_IDS.map(id => `${id} [${SCENES[id].tags.join(", ")}]`).join(", ")}`);
    return log(`Packs: ${availablePacks().join(", ")}`);
  }
  if (options.command !== "generate") throw new UsageError(`Unknown command "${options.command}". Try: generate, init, scenes.`);

  const config = readConfigFile(configFile);
  const date = options.date ?? today(config.timezone, now);
  parseDate(date);
  const out = options.out ?? "assets";
  const { files, selection } = generate(config, { date, scene: options.scene, funky: options.flags.has("funky") });
  fs.mkdirSync(out, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(out, name), content);
  // The scene is named only when the caller forced it: on a real day it could reveal a personal date.
  const scene = options.scene ? selection.scene ?? "none" : selection.scene ? "special" : "none";
  log(`${files.size} files written to ${out} for ${date} (scene: ${scene}, themes: ${selection.themes.dark}/${selection.themes.light}).`);
}

function run(argv = process.argv.slice(2)) {
  try {
    main(argv);
  } catch (error) {
    const expected = error instanceof ConfigError || error instanceof UsageError || /^(Unknown (scene|pack)|Invalid date|Can not read|Mascot file|A date)/.test(error.message);
    console.error(`daily-banner: ${error.message}`);
    if (process.env.GITHUB_ACTIONS === "true") console.log(`::error title=daily-banner::${error.message.replace(/\s+/g, " ")}`);
    if (error instanceof UsageError) console.error('Run "daily-banner --help" for the options.');
    if (!expected) console.error(error.stack);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

module.exports = { main, parseArguments, run, UsageError };
if (require.main === module) run();
