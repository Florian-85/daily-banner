"use strict";
// Stack pills: additions only. A technology found by the detection is added to its row; nothing
// already shown is ever removed. A name missing from the dictionary is reported, never displayed.

const sameItem = (a, b) => (typeof a === "string" ? a === b : typeof b !== "string" && a.i18n === b.i18n);
const labelOf = item => (typeof item === "string" ? item : `i18n:${item.i18n}`);

// detected: [{ name, row? }]; dictionary: { "<detected name>": { item, row } }
function mergeStack(stack, detected, dictionary) {
  const rows = Object.fromEntries(Object.entries(stack.rows).map(([row, items]) => [row, [...items]]));
  const added = [];
  const unknown = [];
  for (const { name } of detected) {
    const entry = dictionary[name];
    if (!entry) {
      if (!unknown.includes(name)) unknown.push(name);
      continue;
    }
    rows[entry.row] ??= [];
    if (!rows[entry.row].some(existing => sameItem(existing, entry.item))) {
      rows[entry.row].push(entry.item);
      added.push(labelOf(entry.item));
    }
  }
  return { stack: { ...stack, rows }, added, unknown };
}

module.exports = { mergeStack };
