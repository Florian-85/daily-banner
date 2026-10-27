"use strict";
// Packs are data: the dates on which something special happens. v0.1 ships three packs and reads
// only those (a pack folder chosen by the user is planned: see docs/design-anchors-variants.md).

const fs = require("node:fs");
const path = require("node:path");

const PACKS_DIR = path.join(__dirname, "..", "..", "packs");
const DAY = /^(\d{2})-(\d{2})$/;

function isDay(value) {
  const match = DAY.exec(String(value));
  return Boolean(match) && new Date(Date.UTC(2024, Number(match[1]) - 1, Number(match[2]))).toISOString().slice(5, 10) === value;
}

function validatePack(pack, scenes) {
  const where = `Pack ${JSON.stringify(pack?.id)}`;
  const fail = message => { throw new Error(`${where}: ${message}`); };
  if (!pack || typeof pack !== "object") fail("not an object.");
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(pack.id ?? "")) fail("\"id\" must be lowercase letters, digits and dashes.");
  if (!pack.license) fail('"license" is required (public packs are CC0-1.0).');
  for (const event of pack.events ?? []) {
    if (!event.id || !Array.isArray(event.dates) || !event.dates.length) fail(`event ${JSON.stringify(event.id)} needs an "id" and a list of "dates".`);
    for (const date of event.dates) if (!isDay(date)) fail(`event "${event.id}" has an invalid date ${JSON.stringify(date)} (expected MM-DD).`);
    if (event.scene && !scenes.includes(event.scene)) fail(`event "${event.id}" uses the unknown scene "${event.scene}".`);
  }
  const funky = pack.funky ?? {};
  for (const date of funky.dates ?? []) if (!isDay(date)) fail(`invalid funky date ${JSON.stringify(date)} (expected MM-DD).`);
  return pack;
}

function availablePacks() {
  return fs.readdirSync(PACKS_DIR).filter(name => fs.existsSync(path.join(PACKS_DIR, name, "pack.json"))).sort();
}

function loadPack(id, scenes) {
  const known = availablePacks();
  if (!known.includes(id)) throw new Error(`Unknown pack "${id}". Available packs: ${known.map(name => `"${name}"`).join(", ")}.`);
  const pack = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, id, "pack.json"), "utf8"));
  return validatePack(pack, scenes);
}

// Merges the chosen packs into the calendar shape that calendar.cjs reads.
function buildCalendar(ids, { scenes, exclude = [], salt, surprise }) {
  const calendar = { events: [], funky: { dates: [], nthWeekdays: [], frenchHolidays: false } };
  for (const id of ids) {
    const pack = loadPack(id, scenes);
    for (const event of pack.events ?? []) {
      calendar.events.push(exclude.includes(event.scene) ? { ...event, scene: null } : event);
    }
    calendar.funky.dates.push(...(pack.funky?.dates ?? []));
    calendar.funky.nthWeekdays.push(...(pack.funky?.nthWeekdays ?? []));
    if (pack.funky?.frenchHolidays) calendar.funky.frenchHolidays = true;
  }
  if (surprise) {
    calendar.funky.surprisePerMonth = 1;
    calendar.funky.salt = salt;
  }
  return calendar;
}

module.exports = { buildCalendar, availablePacks, loadPack, validatePack, isDay };
