const test = require("node:test");
const assert = require("node:assert/strict");
const { getRandomBotName } = require("../src/utils/botName");

function withRandom(random, callback) {
  const originalRandom = Math.random;
  Math.random = () => random;
  try {
    callback();
  } finally {
    Math.random = originalRandom;
  }
}

test("bot name preserves first and last random selections", () => {
  withRandom(0, () => {
    assert.equal(getRandomBotName(), "Aziz");
  });
  withRandom(0.999999, () => {
    assert.equal(getRandomBotName(), "Zarina");
  });
});

test("bot name preserves every configured selection", () => {
  const expected = ["Aziz", "Malika", "Bobur", "Nigora", "Sardor", "Dilnoza", "Jahongir", "Zarina"];
  expected.forEach((name, index) => {
    withRandom((index + 0.25) / expected.length, () => {
      assert.equal(getRandomBotName(), name);
    });
  });
});

test("bot name preserves out-of-range random behavior", () => {
  withRandom(1, () => {
    assert.equal(getRandomBotName(), undefined);
  });
});
