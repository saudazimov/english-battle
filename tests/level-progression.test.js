const test = require("node:test");
const assert = require("node:assert/strict");
const { getNextLevel } = require("../src/utils/levelProgression");

test("level progression preserves every CEFR transition", () => {
  assert.equal(getNextLevel("A1"), "A2");
  assert.equal(getNextLevel("A2"), "B1");
  assert.equal(getNextLevel("B1"), "B2");
  assert.equal(getNextLevel("B2"), "C1");
  assert.equal(getNextLevel("C1"), "C2");
});

test("level progression preserves highest-level result", () => {
  assert.equal(getNextLevel("C2"), null);
});

test("level progression preserves unknown and missing-level results", () => {
  assert.equal(getNextLevel("a1"), null);
  assert.equal(getNextLevel("UNKNOWN"), null);
  assert.equal(getNextLevel(null), null);
  assert.equal(getNextLevel(undefined), null);
});
