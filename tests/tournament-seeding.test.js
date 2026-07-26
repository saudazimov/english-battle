const test = require("node:test");
const assert = require("node:assert/strict");
const { seedOrder } = require("../src/utils/tournamentSeeding");

test("tournament seeding preserves two- and four-slot order", () => {
  assert.deepEqual(seedOrder(2), [1, 2]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
});

test("tournament seeding preserves eight-slot order", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("tournament seeding preserves existing non-power-of-two behavior", () => {
  assert.deepEqual(seedOrder(1), [1, 2]);
  assert.deepEqual(seedOrder(3), [1, 4, 2, 3]);
});
