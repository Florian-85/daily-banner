"use strict";
// Chooses the scene and the theme family of the day, without any stored state.
// Private dates (config/calendar.private.json) only change the picture: nothing published says why.

const pad = value => String(value).padStart(2, "0");
const key = (month, day) => `${pad(month)}-${pad(day)}`;

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) throw new Error(`Invalid date: ${value} (expected YYYY-MM-DD).`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  // Rejects 2026-13-01 and 2026-02-31 instead of letting Date roll them over.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${value} (not a real calendar day).`);
  }
  return { year, month, day };
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function frenchHolidays(year) {
  const fixed = [[1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]].map(([m, d]) => key(m, d));
  const easter = easterSunday(year);
  const shifted = days => {
    const date = new Date(easter.getTime() + days * 86400000);
    return key(date.getUTCMonth() + 1, date.getUTCDate());
  };
  return new Set([...fixed, shifted(1), shifted(39), shifted(50)]); // Easter Monday, Ascension, Whit Monday
}

// weekday: 0 = Sunday ... 6 = Saturday; nth: 1 = first.
function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return key(month, day);
}

function hash(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

// One "surprise" day per month, between the 1st and the 28th, avoiding already planned days.
function surpriseDays(year, month, salt, taken) {
  const day = 1 + (hash(`${salt}:${year}-${pad(month)}`) % 28);
  for (let offset = 0; offset < 28; offset++) {
    const candidate = key(month, 1 + ((day - 1 + offset) % 28));
    if (!taken.has(candidate)) return [candidate];
  }
  return [];
}

function plannedKeys(year, calendar, privateCalendar) {
  const keys = new Set();
  for (const source of [calendar, privateCalendar]) {
    for (const event of source?.events ?? []) for (const date of event.dates) keys.add(date);
  }
  const funky = calendar.funky ?? {};
  for (const date of funky.dates ?? []) keys.add(date);
  if (funky.frenchHolidays) for (const date of frenchHolidays(year)) keys.add(date);
  for (const rule of funky.nthWeekdays ?? []) keys.add(nthWeekday(year, rule.month, rule.weekday, rule.nth));
  return keys;
}

// Returns { id, scene, funky }. Private events win over public ones, scenes win over plain funky days.
function selectDay(dateString, calendar, privateCalendar = { events: [] }) {
  const { year, month, day } = parseDate(dateString);
  const today = key(month, day);
  for (const source of [privateCalendar, calendar]) {
    for (const event of source.events ?? []) {
      if (event.dates.includes(today)) return { id: event.id, scene: event.scene ?? null, funky: event.theme === "funky" };
    }
  }
  const funky = calendar.funky ?? {};
  if ((funky.dates ?? []).includes(today)) return { id: "funky-date", scene: null, funky: true };
  if (funky.frenchHolidays && frenchHolidays(year).has(today)) return { id: "french-holiday", scene: null, funky: true };
  for (const rule of funky.nthWeekdays ?? []) {
    if (nthWeekday(year, rule.month, rule.weekday, rule.nth) === today) return { id: "weekday-rule", scene: null, funky: true };
  }
  if (funky.surprisePerMonth) {
    const taken = plannedKeys(year, calendar, privateCalendar);
    if (surpriseDays(year, month, funky.salt ?? "profile", taken).includes(today)) return { id: "surprise", scene: null, funky: true };
  }
  return { id: "normal", scene: null, funky: false };
}

function themesFor(selection, defaults = { dark: "dark", light: "light" }) {
  return selection.funky ? { dark: "funky-dark", light: "funky-light" } : defaults;
}

module.exports = { selectDay, themesFor, frenchHolidays, easterSunday, nthWeekday, surpriseDays, parseDate };
