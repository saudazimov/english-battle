const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSchool } = require("../src/utils/schoolNormalization");

test("school normalization preserves numbered-school format", () => {
  assert.equal(normalizeSchool(" 23-sonli umumiy o'rta ta'lim maktabi "), "23-maktab");
  assert.equal(normalizeSchool("School #005"), "005-maktab");
  assert.equal(normalizeSchool("12 va 34-maktab"), "12-maktab");
});

test("school normalization preserves named-school cleanup", () => {
  assert.equal(normalizeSchool("  BERUNIY   nomidagi  "), "beruniy nomidagi");
  assert.equal(normalizeSchool("<Ibn Sino> \"School\""), "ibn sino school");
});

test("school normalization preserves empty-value handling", () => {
  assert.equal(normalizeSchool(null), null);
  assert.equal(normalizeSchool(undefined), null);
  assert.equal(normalizeSchool("   "), null);
  assert.equal(normalizeSchool(0), null);
  assert.equal(normalizeSchool("<>"), "");
});

test("school normalization preserves length and non-string behavior", () => {
  assert.equal(normalizeSchool("A".repeat(250)).length, 200);
  assert.throws(() => normalizeSchool(123), TypeError);
});
