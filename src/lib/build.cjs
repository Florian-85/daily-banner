"use strict";
// Builds every public file of the profile (images and READMEs) in memory.
// Pure function: no network, no clock, no secret. Collection and publication live elsewhere.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { THEMES } = require("./palette.cjs");
const { banner, SCENES } = require("./banner.cjs");
const cards = require("./cards.cjs");
const { selectDay, themesFor, parseDate } = require("./calendar.cjs");
const { renderReadme } = require("./readme.cjs");

const CONFIG_FILES = ["profile", "projects", "stack", "mascot", "calendar", "calendar.private", "learning"];

function loadConfig(directory) {
  const read = name => {
    const file = path.join(directory, `${name}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  };
  const config = Object.fromEntries(CONFIG_FILES.map(name => [name, read(name)]));
  for (const required of ["profile", "projects", "stack", "mascot", "calendar"]) {
    if (!config[required]) throw new Error(`Missing configuration file: ${required}.json`);
  }
  config.snapshot = read("snapshot");
  return config;
}

// Which scene and which pair of themes apply on the given day (YYYY-MM-DD).
function selectionFor(config, date, override = {}) {
  parseDate(date); // always validated, even when a scene is forced
  let selection = override.scene
    ? { id: `forced:${override.scene}`, scene: override.scene === "none" ? null : override.scene, funky: false }
    : selectDay(date, config.calendar, config["calendar.private"] ?? undefined);
  if (override.funky) selection = { ...selection, funky: true }; // applied after the calendar: the day's scene is kept
  if (selection.scene && !SCENES[selection.scene]) throw new Error(`Unknown scene: ${selection.scene}`);
  return { ...selection, themes: themesFor(selection, { dark: config.profile.defaults.theme, light: "light" }) };
}

// Opaque cache-busting value: derived from the content, never from the date, so a private
// date can not leak into the README through the image URLs.
function contentVersion(files) {
  const hash = crypto.createHash("sha256");
  for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update("\0").update(content);
  return hash.digest("hex").slice(0, 10);
}

function buildProfile(config, data, { date, version, override = {} } = {}) {
  if (!date) throw new Error("A date (YYYY-MM-DD) is required.");
  const now = new Date(`${date}T12:00:00Z`);
  const profile = config.profile;
  const selection = selectionFor(config, date, override);
  const files = new Map();
  const languages = Object.keys(profile.i18n);
  const shown = config.projects.projects.filter(project => project.shown);

  for (const lang of languages) {
    const i18n = profile.i18n[lang];
    for (const mode of ["dark", "light"]) {
      const T = THEMES[selection.themes[mode]];
      const base = `assets/${lang}/${mode}`;
      files.set(`${base}/banner.svg`, banner(T, i18n, selection.scene, config.mascot));
      files.set(`${base}/stack.svg`, cards.stackCard(T, i18n, config.stack));
      files.set(`${base}/journey.svg`, cards.journeyCard(T, i18n));
      files.set(`${base}/learning.svg`, cards.learningCard(T, lang, i18n, data.duolingo, now));
      files.set(`${base}/streak.svg`, cards.streakCard(T, lang, i18n, data.streak));
      files.set(`${base}/stats.svg`, cards.statsCard(T, lang, i18n, data.stats));
      files.set(`${base}/languages.svg`, cards.languagesCard(T, data.languages));
      for (const project of shown) {
        const stats = data.projects[project.id];
        if (!stats) throw new Error(`No data for project ${project.id}.`);
        files.set(`${base}/card-${project.id}.svg`, cards.projectCard(T, lang, i18n, profile.statuses, project, stats));
      }
    }
  }
  const assetVersion = version ?? contentVersion(files);
  for (const lang of languages) {
    const readmeName = lang === profile.defaults.lang ? "README.md" : `README.${lang}.md`;
    files.set(readmeName, renderReadme({ lang, i18n: profile.i18n[lang], projects: config.projects.projects, discussionsUrl: profile.discussionsUrl, version: assetVersion }));
  }
  return { files, selection };
}

module.exports = { buildProfile, loadConfig, selectionFor };
