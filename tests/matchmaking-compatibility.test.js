const test = require("node:test");
const assert = require("node:assert/strict");
const { mmCompatible } = require("../src/utils/matchmakingCompatibility");

function withCurrentTime(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    callback();
  } finally {
    Date.now = originalNow;
  }
}

function entry(overrides = {}) {
  return {
    mode: "classic",
    level: "A1",
    rating: 1000,
    joinedAt: 100000,
    ...overrides,
  };
}

test("matchmaking compatibility preserves mode and level checks", () => {
  assert.equal(mmCompatible(entry(), entry({ mode: "speed" })), false);
  assert.equal(mmCompatible(entry(), entry({ level: "A2" })), false);
});

test("matchmaking compatibility preserves the initial rating window", () => {
  withCurrentTime(100000, () => {
    assert.equal(mmCompatible(entry(), entry({ rating: 1100 })), true);
    assert.equal(mmCompatible(entry(), entry({ rating: 1101 })), false);
  });
});

test("matchmaking compatibility preserves the widest waited-player window", () => {
  withCurrentTime(100000, () => {
    const waitedPlayer = entry({ joinedAt: 55000 });
    assert.equal(mmCompatible(waitedPlayer, entry({ rating: 1200 })), true);
    assert.equal(mmCompatible(waitedPlayer, entry({ rating: 1201 })), false);
  });
});

test("matchmaking compatibility preserves missing and zero rating fallback", () => {
  withCurrentTime(100000, () => {
    assert.equal(mmCompatible(entry({ rating: 0 }), entry({ rating: undefined })), true);
  });
});
