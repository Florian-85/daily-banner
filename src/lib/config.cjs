"use strict";
// Reads and validates the user's configuration (daily-banner.json). Every message says what is wrong
// and what is accepted, because the people who edit this file have never seen the code.

const fs = require("node:fs");
const path = require("node:path");
const { THEME_NAMES } = require("./palette.cjs");

const LANGUAGES = ["en", "fr"];
const MAIN_THEMES = ["dark", "light"];
const { FONT_IDS, BACKENDS } = require("./text.cjs");

const LIMITS = { name: 32, headlineCount: 8, headline: 48, subtitle: 70, location: 24, alt: 200, days: 40 };
const KEYS = ["$schema", "name", "highlight", "headline", "subtitle", "location", "lang", "theme", "mascot", "font", "textBackend", "packs", "exclude", "days", "surprise", "timezone", "alt"];

const DEFAULTS = {
  highlight: "last",
  headline: ["Hello, world!"],
  subtitle: "",
  location: "",
  lang: "en",
  theme: "dark",
  mascot: "cat",
  font: "poppins",
  textBackend: "auto",
  packs: ["core", "geek-days"],
  exclude: [],
  days: [],
  surprise: true,
  timezone: "UTC",
};

class ConfigError extends Error {}

const fail = message => { throw new ConfigError(message); };
const list = values => values.map(value => `"${value}"`).join(", ");
// Control characters would break the SVG (or hide text); everything else is escaped when drawn.
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const length = text => Array.from(text).length;

function text(value, key, { max, required = false }) {
  if (typeof value !== "string") fail(`"${key}" must be a text between quotes.`);
  const trimmed = value.trim();
  if (required && !trimmed) fail(`"${key}" can not be empty.`);
  if (CONTROL.test(trimmed)) fail(`"${key}" contains a control character (line break, tab…): keep it on one line.`);
  if (length(trimmed) > max) fail(`"${key}" is too long (${length(trimmed)} characters, ${max} at most).`);
  return trimmed.replace(/\s+/g, " ");
}

function oneOf(value, key, allowed) {
  if (!allowed.includes(value)) fail(`"${key}" must be one of ${list(allowed)} (got ${JSON.stringify(value)}).`);
  return value;
}

function textList(value, key, { max, count }) {
  if (!Array.isArray(value)) fail(`"${key}" must be a list, for example ["one", "two"].`);
  if (value.length > count) fail(`"${key}" has ${value.length} items, ${count} at most.`);
  return value.map((item, index) => text(item, `${key}[${index}]`, { max, required: true }));
}

// A mascot file is looked up next to the configuration and may not leave that folder.
function mascotFile(value, key, directory) {
  if (typeof value !== "string" || !value.trim()) fail(`"${key}" must be the name of a file, for example "my-mascot.json".`);
  if (path.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) fail(`"${key}" must be a path inside your repository, not an absolute path.`);
  const resolved = path.resolve(directory, value);
  const relative = path.relative(directory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`"${key}" must stay inside the folder of the configuration file.`);
  return resolved;
}

function validate(input, { directory = process.cwd() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("The configuration must be a JSON object: { \"name\": \"…\" }.");
  for (const key of Object.keys(input)) {
    if (!KEYS.includes(key)) fail(`Unknown option "${key}". Accepted options: ${list(KEYS.filter(k => k !== "$schema"))}.`);
  }
  if (input.name === undefined) fail('"name" is required, for example { "name": "Ada Lovelace" }.');
  const config = { ...DEFAULTS };
  config.name = text(input.name, "name", { max: LIMITS.name, required: true });
  if (input.highlight !== undefined) config.highlight = oneOf(input.highlight, "highlight", ["last", "first"]);
  if (input.headline !== undefined) {
    config.headline = textList(input.headline, "headline", { max: LIMITS.headline, count: LIMITS.headlineCount });
    if (!config.headline.length) fail('"headline" needs at least one phrase.');
  }
  if (input.subtitle !== undefined) config.subtitle = text(input.subtitle, "subtitle", { max: LIMITS.subtitle });
  if (input.location !== undefined) config.location = text(input.location, "location", { max: LIMITS.location });
  if (input.alt !== undefined) config.alt = text(input.alt, "alt", { max: LIMITS.alt, required: true });
  if (input.lang !== undefined) config.lang = oneOf(input.lang, "lang", LANGUAGES);
  if (input.theme !== undefined) config.theme = oneOf(input.theme, "theme", MAIN_THEMES);
  if (input.font !== undefined) config.font = oneOf(input.font, "font", FONT_IDS);
  if (input.textBackend !== undefined) config.textBackend = oneOf(input.textBackend, "textBackend", BACKENDS);
  if (input.surprise !== undefined) {
    if (typeof input.surprise !== "boolean") fail('"surprise" must be true or false.');
    config.surprise = input.surprise;
  }
  if (input.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone });
    } catch {
      fail(`"timezone" is not a known time zone (got ${JSON.stringify(input.timezone)}). Use a name such as "Europe/Paris" or "UTC".`);
    }
    config.timezone = input.timezone;
  }
  if (input.mascot !== undefined) {
    const mascot = input.mascot;
    if (typeof mascot === "string") config.mascot = oneOf(mascot, "mascot", ["cat", "stars", "none"]);
    else if (mascot && typeof mascot === "object" && !Array.isArray(mascot) && Object.keys(mascot).join() === "file") {
      config.mascot = { file: mascotFile(mascot.file, "mascot.file", directory) };
    } else fail('"mascot" must be "cat", "stars", "none" or { "file": "my-mascot.json" }.');
  }
  if (input.packs !== undefined) config.packs = textList(input.packs, "packs", { max: 40, count: 10 });
  if (input.exclude !== undefined) config.exclude = textList(input.exclude, "exclude", { max: 40, count: 40 });
  if (input.days !== undefined) {
    if (!Array.isArray(input.days)) fail('"days" must be a list, for example [{ "date": "03-14", "scene": "pi" }].');
    if (input.days.length > LIMITS.days) fail(`"days" has ${input.days.length} entries, ${LIMITS.days} at most.`);
    config.days = input.days.map((day, index) => {
      const where = `days[${index}]`;
      if (!day || typeof day !== "object" || Array.isArray(day)) fail(`"${where}" must look like { "date": "03-14", "scene": "pi" }.`);
      for (const key of Object.keys(day)) if (!["date", "scene", "theme"].includes(key)) fail(`"${where}" has an unknown option "${key}" (accepted: "date", "scene", "theme").`);
      const match = /^(\d{2})-(\d{2})$/.exec(String(day.date));
      const valid = match && new Date(Date.UTC(2024, Number(match[1]) - 1, Number(match[2]))).toISOString().slice(5, 10) === day.date; // 2024 is a leap year
      if (!valid) fail(`"${where}.date" must be a real day written MM-DD, for example "03-14" (got ${JSON.stringify(day.date)}).`);
      if (day.scene === undefined && day.theme === undefined) fail(`"${where}" needs a "scene", a "theme", or both.`);
      const out = { date: day.date };
      if (day.scene !== undefined) out.scene = text(day.scene, `${where}.scene`, { max: 40, required: true });
      if (day.theme !== undefined) out.theme = oneOf(day.theme, `${where}.theme`, ["funky", "normal"]);
      return out;
    });
  }
  return config;
}

function readConfigFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") fail(`Configuration file not found: ${file}. Create it with "daily-banner init" or pass --config <file>.`);
    fail(`Can not read ${file}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}. Check commas and quotes.`);
  }
  return validate(parsed, { directory: path.dirname(path.resolve(file)) });
}

module.exports = { validate, readConfigFile, ConfigError, DEFAULTS, LIMITS, LANGUAGES, THEME_NAMES, length };
