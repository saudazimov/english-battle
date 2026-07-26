const test = require("node:test");
const assert = require("node:assert/strict");
const { BATTLE_LENGTHS, lengthConfig } = require("../src/utils/battleLength");

test("battle length preserves every configured format", () => {
  assert.deepEqual(BATTLE_LENGTHS, {
    quick: { label: "Quick", questions: 10, secondsPerQuestion: 15, totalSeconds: 150, xp: 4, coins: 1 },
    standard: { label: "Standard", questions: 20, secondsPerQuestion: 15, totalSeconds: 300, xp: 8, coins: 2 },
    extended: { label: "Extended", questions: 30, secondsPerQuestion: 15, totalSeconds: 450, xp: 12, coins: 3 },
    marathon: { label: "Marathon", questions: 40, secondsPerQuestion: 15, totalSeconds: 600, xp: 16, coins: 4 },
  });
});

test("battle length preserves valid format lookup", () => {
  assert.equal(lengthConfig("quick"), BATTLE_LENGTHS.quick);
  assert.equal(lengthConfig("standard"), BATTLE_LENGTHS.standard);
  assert.equal(lengthConfig("extended"), BATTLE_LENGTHS.extended);
  assert.equal(lengthConfig("marathon"), BATTLE_LENGTHS.marathon);
});

test("battle length preserves standard fallback", () => {
  assert.equal(lengthConfig("invalid"), BATTLE_LENGTHS.standard);
  assert.equal(lengthConfig(""), BATTLE_LENGTHS.standard);
  assert.equal(lengthConfig(null), BATTLE_LENGTHS.standard);
  assert.equal(lengthConfig(undefined), BATTLE_LENGTHS.standard);
});
