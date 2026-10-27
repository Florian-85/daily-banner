"use strict";
// Turns a validated configuration and a date into the banner files, in memory.
// No clock, no network, no hidden input: the same configuration and date always give the same bytes.

const { THEMES } = require("./palette.cjs");
const { isDark } = require("./svg.cjs");
const { selectDay, themesFor, parseDate } = require("./calendar.cjs");
const { buildCalendar } = require("./packs.cjs");
const { loadMascot } = require("./mascots.cjs");
const { layoutName } = require("./layout.cjs");
const { banner, phrasesFor } = require("./banner.cjs");
const { SCENES, SCENE_IDS } = require("./scenes.cjs");

const OUTPUT = { main: "daily-banner.svg", dark: "daily-banner-dark.svg", light: "daily-banner-light.svg" };

// Today's date (YYYY-MM-DD) in the configured time zone.
function today(timezone = "UTC", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const known = () => SCENE_IDS.map(id => `"${id}"`).join(", ");

function checkScenes(config, override) {
  for (const id of config.exclude) if (!SCENES[id]) throw new Error(`Unknown scene "${id}" in "exclude". Available scenes: ${known()}.`);
  config.days.forEach((day, index) => {
    if (day.scene && !SCENES[day.scene]) throw new Error(`Unknown scene "${day.scene}" in days[${index}]. Available scenes: ${known()}.`);
  });
  if (override.scene && override.scene !== "none" && !SCENES[override.scene]) throw new Error(`Unknown scene "${override.scene}". Available scenes: ${known()}, or "none".`);
}

function hasAnchors(scene, layout, mascot) {
  return (SCENES[scene].requires ?? []).every(name => {
    if (name.startsWith("name.")) return Boolean(layout.anchors[name]);
    if (name.startsWith("mascot.")) return Boolean(mascot?.anchors[name.slice(7)]);
    return false;
  });
}

function select(config, date, override) {
  parseDate(date); // always validated, even when a scene is forced
  const calendar = buildCalendar(config.packs, { scenes: SCENE_IDS, exclude: config.exclude, salt: config.name, surprise: config.surprise });
  const personal = { events: config.days.map((day, index) => ({ id: `day-${index}`, scene: day.scene ?? null, dates: [day.date], theme: day.theme === "normal" ? undefined : "funky" })) };
  let selection = override.scene
    ? { id: `forced:${override.scene}`, scene: override.scene === "none" ? null : override.scene, funky: false }
    : selectDay(date, calendar, personal);
  if (override.funky) selection = { ...selection, funky: true }; // applied after the calendar: the day's scene is kept
  return selection;
}

function rotate(list, steps) {
  const offset = steps % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function dayOfYear({ year, month, day }) {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
}

function generate(config, { date, scene, funky } = {}) {
  if (!date) throw new Error("A date (YYYY-MM-DD) is required.");
  const override = { scene, funky };
  checkScenes(config, override);
  const mascot = loadMascot(config.mascot);
  const layout = layoutName(config.name, { highlight: config.highlight, maxWidth: mascot ? 610 : 800 });
  if (!layout.fits) throw new Error(`The name "${config.name}" is too wide for the banner even in small letters: shorten it.`);
  let selection = select(config, date, override);
  // A scene whose anchors the layout or the mascot can not provide is not offered: the day keeps its theme only.
  if (selection.scene && !hasAnchors(selection.scene, layout, mascot)) selection = { ...selection, scene: null };
  const themes = themesFor(selection, { dark: "dark", light: "light" });
  const base = rotate(config.headline, dayOfYear(parseDate(date)));
  const phrases = phrasesFor(selection.scene, config.lang, base);
  const files = new Map();
  for (const mode of ["dark", "light"]) {
    const T = THEMES[themes[mode]];
    files.set(OUTPUT[mode], banner(T, { config, scene: selection.scene, phrases, mascot, dark: isDark(T) }));
  }
  files.set(OUTPUT.main, files.get(OUTPUT[config.theme]));
  return { files, selection: { ...selection, themes } };
}

module.exports = { generate, today, OUTPUT };
