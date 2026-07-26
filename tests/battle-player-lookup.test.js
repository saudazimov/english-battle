const test = require("node:test");
const assert = require("node:assert/strict");
const { findPlayerKeyByUser } = require("../src/utils/battlePlayerLookup");

test("battle player lookup preserves matching socket key", () => {
  const battle = {
    players: {
      socketA: { userId: 7 },
      socketB: { userId: 9 },
    },
  };

  assert.equal(findPlayerKeyByUser(battle, 9), "socketB");
  assert.equal(findPlayerKeyByUser(battle, "7"), "socketA");
});

test("battle player lookup preserves first-match and missing results", () => {
  const battle = {
    players: {
      firstSocket: { userId: 7 },
      secondSocket: { userId: "7" },
    },
  };

  assert.equal(findPlayerKeyByUser(battle, 7), "firstSocket");
  assert.equal(findPlayerKeyByUser(battle, 99), null);
});

test("battle player lookup preserves invalid battle errors", () => {
  assert.throws(() => findPlayerKeyByUser(null, 7), TypeError);
  assert.throws(() => findPlayerKeyByUser({}, 7), TypeError);
});
