const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeStack } = require("./lib/stack.cjs");

const stack = { rows: { languages: ["Python"], infra: ["Linux", { i18n: "sysadmin" }] } };
const dictionary = {
  Go: { item: "Go", row: "languages" },
  Python: { item: "Python", row: "languages" },
  Dockerfile: { item: "Docker", row: "infra" },
  Sysadmin: { item: { i18n: "sysadmin" }, row: "infra" },
};

test("adds new technologies to their row", () => {
  const result = mergeStack(stack, [{ name: "Go" }, { name: "Dockerfile" }], dictionary);
  assert.deepEqual(result.stack.rows.languages, ["Python", "Go"]);
  assert.deepEqual(result.stack.rows.infra, ["Linux", { i18n: "sysadmin" }, "Docker"]);
  assert.deepEqual(result.added, ["Go", "Docker"]);
});

test("never removes or duplicates an item already shown", () => {
  const result = mergeStack(stack, [{ name: "Python" }, { name: "Sysadmin" }], dictionary);
  assert.deepEqual(result.stack.rows, stack.rows);
  assert.deepEqual(result.added, []);
});

test("an empty detection keeps every pill (no removal on a failed collection)", () => {
  assert.deepEqual(mergeStack(stack, [], dictionary).stack.rows, stack.rows);
});

test("reports unknown technologies instead of displaying them", () => {
  const result = mergeStack(stack, [{ name: "lodash" }, { name: "lodash" }], dictionary);
  assert.deepEqual(result.unknown, ["lodash"]);
  assert.deepEqual(result.stack.rows, stack.rows);
});

test("does not mutate its input", () => {
  const before = JSON.stringify(stack);
  mergeStack(stack, [{ name: "Go" }], dictionary);
  assert.equal(JSON.stringify(stack), before);
});
