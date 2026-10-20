const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selectDay, themesFor, frenchHolidays, easterSunday, nthWeekday, surpriseDays } = require("./lib/calendar.cjs");

const calendar = {
  events: [
    { id: "noel", scene: "noel", dates: ["12-24", "12-25"] },
    { id: "halloween", scene: "halloween", dates: ["10-31"] },
  ],
  funky: { dates: ["01-01"], frenchHolidays: true, nthWeekdays: [{ month: 10, weekday: 2, nth: 2 }], surprisePerMonth: 1, salt: "test" },
};
const privateCalendar = { events: [{ id: "private", scene: "anniv", theme: "funky", dates: ["03-03", "12-25"] }] };

test("computes Easter and the French movable holidays", () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
  const holidays = frenchHolidays(2026);
  for (const day of ["04-06", "05-14", "05-25", "07-14", "12-25"]) assert.ok(holidays.has(day), day);
  assert.ok(!holidays.has("04-07"));
});

test("finds the second Tuesday of October (Ada Lovelace Day)", () => {
  assert.equal(nthWeekday(2026, 10, 2, 2), "10-13");
  assert.equal(nthWeekday(2027, 10, 2, 2), "10-12");
});

test("a scene wins over a plain funky day, and private events win over public ones", () => {
  assert.deepEqual(selectDay("2026-10-31", calendar), { id: "halloween", scene: "halloween", funky: false });
  assert.deepEqual(selectDay("2026-12-25", calendar), { id: "noel", scene: "noel", funky: false });
  assert.deepEqual(selectDay("2026-12-25", calendar, privateCalendar), { id: "private", scene: "anniv", funky: true });
  assert.deepEqual(selectDay("2026-03-03", calendar, privateCalendar), { id: "private", scene: "anniv", funky: true });
});

test("funky days switch the theme without a scene", () => {
  for (const date of ["2026-01-01", "2026-10-13", "2026-07-14"]) {
    const selection = selectDay(date, calendar);
    assert.equal(selection.scene, null, date);
    assert.equal(selection.funky, true, date);
  }
});

test("an ordinary day keeps the default themes", () => {
  const selection = selectDay("2026-02-10", { events: [], funky: {} });
  assert.deepEqual(selection, { id: "normal", scene: null, funky: false });
  assert.deepEqual(themesFor(selection), { dark: "dark", light: "light" });
  assert.deepEqual(themesFor({ funky: true }), { dark: "funky-dark", light: "funky-light" });
});

test("exactly one surprise day per month, stable and never on a planned day", () => {
  for (let month = 1; month <= 12; month++) {
    const surprises = [];
    for (let day = 1; day <= 31; day++) {
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (Number.isNaN(Date.parse(date)) || new Date(date).getUTCMonth() + 1 !== month) continue;
      if (selectDay(date, calendar, privateCalendar).id === "surprise") surprises.push(date);
    }
    assert.equal(surprises.length, 1, `month ${month}`);
  }
  const first = surpriseDays(2026, 5, "test", new Set());
  assert.deepEqual(first, surpriseDays(2026, 5, "test", new Set()));
  assert.notDeepEqual(surpriseDays(2026, 5, "test", new Set(first)), first);
});

test("rejects malformed dates", () => {
  assert.throws(() => selectDay("2026-1-1", calendar), /Invalid date/);
});
