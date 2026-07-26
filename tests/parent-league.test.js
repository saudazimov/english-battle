const test = require("node:test");
const assert = require("node:assert/strict");
const { parentLeagueName } = require("../src/utils/parentLeague");

test("parent league preserves every rating boundary", () => {
  assert.equal(parentLeagueName(999), "Bronze");
  assert.equal(parentLeagueName(1000), "Silver");
  assert.equal(parentLeagueName(1200), "Gold");
  assert.equal(parentLeagueName(1400), "Platinum");
  assert.equal(parentLeagueName(1600), "Diamond");
  assert.equal(parentLeagueName(1800), "Master");
  assert.equal(parentLeagueName(2000), "Grandmaster");
});

test("parent league preserves values above and below the boundaries", () => {
  assert.equal(parentLeagueName(-50), "Bronze");
  assert.equal(parentLeagueName(1199), "Silver");
  assert.equal(parentLeagueName(2500), "Grandmaster");
});

test("parent league preserves missing and numeric-string handling", () => {
  assert.equal(parentLeagueName(null), "Bronze");
  assert.equal(parentLeagueName(undefined), "Bronze");
  assert.equal(parentLeagueName("1400"), "Platinum");
});
