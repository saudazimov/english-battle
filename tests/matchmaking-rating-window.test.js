const test = require("node:test");
const assert = require("node:assert/strict");
const { mmRatingWindow } = require("../src/utils/matchmakingRatingWindow");

function withCurrentTime(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    callback();
  } finally {
    Date.now = originalNow;
  }
}

test("matchmaking rating window preserves the initial range", () => {
  const now = 100000;
  withCurrentTime(now, () => {
    assert.equal(mmRatingWindow(now), 100);
    assert.equal(mmRatingWindow(now - 19999), 100);
  });
});

test("matchmaking rating window preserves the expanded ranges", () => {
  const now = 100000;
  withCurrentTime(now, () => {
    assert.equal(mmRatingWindow(now - 20000), 150);
    assert.equal(mmRatingWindow(now - 44999), 150);
    assert.equal(mmRatingWindow(now - 45000), 200);
    assert.equal(mmRatingWindow(now - 90000), 200);
  });
});

test("matchmaking rating window preserves future and invalid join handling", () => {
  const now = 100000;
  withCurrentTime(now, () => {
    assert.equal(mmRatingWindow(now + 1000), 100);
    assert.equal(mmRatingWindow(undefined), 100);
  });
});
