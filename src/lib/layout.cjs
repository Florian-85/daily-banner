"use strict";
// Lays the name out and publishes anchors, so scenes never contain coordinates.
// Widths come from the real metrics of the bundled font, so the anchors are exact whichever text backend draws the letters.
const { createText } = require("./text.cjs");

const NAME_X = 48;
const BASELINE = 100;
const MAX_SIZE = 54;
const MIN_SIZE = 28;

// name: "Ada Lovelace"; highlight: "last" (default) or "first" word; maxWidth: room before the mascot.
function layoutName(name, { highlight = "last", maxWidth, text = createText() }) {
  const measure = (value, size) => text.measure(value, size);
  const CAP_HEIGHT = text.capHeight;
  const words = name.split(" ");
  const index = highlight === "first" ? 0 : words.length - 1;
  const characters = Array.from(words[index]);
  const parts = {
    before: words.slice(0, index).join(" "),
    initial: characters[0],
    rest: characters.slice(1).join(""),
    after: words.slice(index + 1).join(" "),
  };
  // A space follows "before" and precedes "after"; the initial and the rest of its word touch.
  const natural = size => {
    const gap = measure(" ", size);
    const widths = ["before", "initial", "rest", "after"].reduce((total, key) => total + (parts[key] ? measure(parts[key], size) : 0), 0);
    return widths + (parts.before ? gap : 0) + (parts.after ? gap : 0);
  };
  let size = MAX_SIZE;
  if (natural(size) > maxWidth) size = Math.max(MIN_SIZE, Math.floor((MAX_SIZE * maxWidth) / natural(MAX_SIZE)));
  const gap = measure(" ", size);
  const pieces = {};
  let x = NAME_X;
  for (const key of ["before", "initial", "rest", "after"]) {
    const text = parts[key];
    if (!text) continue;
    const width = Math.round(measure(text, size));
    pieces[key] = { text, x: Math.round(x), width };
    x += width;
    if (key === "before" || (key === "rest" && parts.after) || (key === "initial" && !parts.rest && parts.after)) x += gap;
  }
  const top = BASELINE - Math.round(size * CAP_HEIGHT);
  const initial = pieces.initial;
  const last = pieces.after ?? pieces.rest ?? initial;
  return {
    size,
    baseline: BASELINE,
    pieces,
    fits: natural(size) <= maxWidth + 1,
    anchors: {
      "name.initial": { x: initial.x + initial.width / 2, y: top, left: initial.x, right: initial.x + initial.width, top, bottom: BASELINE, width: initial.width },
      "name.end": { x: last.x + last.width, y: BASELINE, top, bottom: BASELINE },
    },
  };
}

module.exports = { layoutName, NAME_X, BASELINE };
