const test = require("node:test");
const assert = require("node:assert/strict");
const { makeTeamBot } = require("../src/utils/teamBot");

function withSources(now, randomValues, callback) {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  let randomIndex = 0;
  Date.now = () => now;
  Math.random = () => randomValues[randomIndex++];
  try {
    callback();
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
}

test("team bot preserves reference-player fields and random call order", () => {
  withSources(1720000000000, [0, 0.1234, 0.75], () => {
    assert.deepEqual(makeTeamBot({ level: "B2", lengthKey: "quick", rating: 1500 }, 2), {
      socketId: "pbot_1720000000000_2_123",
      userId: null,
      name: "Sardor",
      level: "B2",
      lengthKey: "quick",
      rating: 1550,
      isBot: true,
    });
  });
});

test("team bot preserves missing-reference defaults", () => {
  withSources(1000, [0.999999, 0.999999, 0.5], () => {
    assert.deepEqual(makeTeamBot(null, 0), {
      socketId: "pbot_1000_0_999",
      userId: null,
      name: "Umid",
      level: "A1",
      lengthKey: "standard",
      rating: 1350,
      isBot: true,
    });
  });
});

test("team bot preserves minimum and zero-rating fallback", () => {
  withSources(1000, [0, 0, 0], () => {
    assert.equal(makeTeamBot({ level: "A1", lengthKey: "standard", rating: 810 }, 0).rating, 800);
  });
  withSources(1000, [0, 0, 0], () => {
    assert.equal(makeTeamBot({ level: "A1", lengthKey: "standard", rating: 0 }, 0).rating, 1000);
  });
});
