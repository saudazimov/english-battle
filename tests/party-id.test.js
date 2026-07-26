const test = require("node:test");
const assert = require("node:assert/strict");
const { makePartyId } = require("../src/utils/partyId");

function withSources(now, random, callback) {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => now;
  Math.random = () => random;
  try {
    callback();
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
}

test("party ID preserves timestamp and random suffix format", () => {
  withSources(1720000000000, 0.56789, () => {
    assert.equal(makePartyId(), "party_1720000000000_5678");
  });
});

test("party ID preserves random suffix boundaries without padding", () => {
  withSources(1000, 0, () => {
    assert.equal(makePartyId(), "party_1000_0");
  });
  withSources(1000, 0.999999, () => {
    assert.equal(makePartyId(), "party_1000_9999");
  });
});
