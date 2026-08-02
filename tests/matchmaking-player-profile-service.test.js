const test = require("node:test");
const assert = require("node:assert/strict");

const createMatchmakingPlayerProfileService = require(
  "../src/services/matchmakingPlayerProfileService"
);

function createService(rows) {
  const calls = [];
  const service = createMatchmakingPlayerProfileService({
    pool: {
      async query(...args) {
        calls.push(["query", ...args]);
        return { rows };
      },
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return value.trim();
    },
  });
  return { calls, service };
}

test("matchmaking profile uses parameterized SQL and authoritative fields", async () => {
  const harness = createService([{
    id: 7,
    first_name: "Ali",
    last_name: "Valiyev",
    cefr_level: "B2",
    rating: 1540,
    profile_picture: "avatar.png",
  }]);

  const profile = await harness.service.loadPlayerProfile("7");

  assert.match(harness.calls[0][1], /WHERE id = \$1 AND is_banned = false/);
  assert.deepEqual(harness.calls[0][2], ["7"]);
  assert.deepEqual(harness.calls[1], ["strip", "Ali Valiyev", 60]);
  assert.deepEqual(profile, {
    userId: 7,
    name: "Ali Valiyev",
    level: "B2",
    rating: 1540,
    profile_picture: "avatar.png",
  });
});

test("matchmaking profile applies safe fallbacks to incomplete DB data", async () => {
  const harness = createService([{
    id: 8,
    first_name: null,
    last_name: null,
    cefr_level: null,
    rating: null,
    profile_picture: null,
  }]);

  assert.deepEqual(await harness.service.loadPlayerProfile(8), {
    userId: 8,
    name: "O'yinchi",
    level: "A1",
    rating: 1000,
    profile_picture: null,
  });
});

test("matchmaking profile rejects missing or banned users", async () => {
  const harness = createService([]);

  await assert.rejects(
    harness.service.loadPlayerProfile(9),
    /Matchmaking user not found/
  );
});
