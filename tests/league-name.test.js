const test = require("node:test");
const assert = require("node:assert/strict");
const { getLeagueName } = require("../src/utils/leagueName");

test("league name preserves every lower boundary", () => {
  assert.equal(getLeagueName(0), "Bronze");
  assert.equal(getLeagueName(1000), "Silver");
  assert.equal(getLeagueName(1200), "Gold");
  assert.equal(getLeagueName(1400), "Platinum");
  assert.equal(getLeagueName(1600), "Diamond");
  assert.equal(getLeagueName(1800), "Master");
  assert.equal(getLeagueName(2000), "Grandmaster");
});

test("league name preserves every upper boundary", () => {
  assert.equal(getLeagueName(999), "Bronze");
  assert.equal(getLeagueName(1199), "Silver");
  assert.equal(getLeagueName(1399), "Gold");
  assert.equal(getLeagueName(1599), "Platinum");
  assert.equal(getLeagueName(1799), "Diamond");
  assert.equal(getLeagueName(1999), "Master");
  assert.equal(getLeagueName(Infinity), "Grandmaster");
});

test("league name preserves coercion and fallback behavior", () => {
  assert.equal(getLeagueName("1400"), "Platinum");
  assert.equal(getLeagueName(-1), "Bronze");
  assert.equal(getLeagueName(999.5), "Bronze");
  assert.equal(getLeagueName(null), "Bronze");
  assert.equal(getLeagueName(undefined), "Bronze");
  assert.equal(getLeagueName(Number.NaN), "Bronze");
});
