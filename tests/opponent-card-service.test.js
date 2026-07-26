const test = require("node:test");
const assert = require("node:assert/strict");

const { createOpponentCardService } = require("../src/services/opponentCardService");

const RATING_SQL = "SELECT rating FROM users WHERE id = $1";
const STATS_SQL = `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE outcome = 'win') AS wins
         FROM battle_history WHERE user_id = $1`;

test("opponent card preserves falsy-user fallback without database access", async () => {
  let queryCalls = 0;
  const service = createOpponentCardService({
    pool: {
      async query() {
        queryCalls += 1;
        throw new Error("must not query");
      },
    },
  });

  assert.deepEqual(await service(null), { rating: 1000, win_rate: 0 });
  assert.deepEqual(await service(0), { rating: 1000, win_rate: 0 });
  assert.equal(queryCalls, 0);
});

test("opponent card preserves SQL order and rounded win rate", async () => {
  const calls = [];
  const responses = [
    { rows: [{ rating: 1420 }] },
    { rows: [{ total: "3", wins: "2" }] },
  ];
  const service = createOpponentCardService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.deepEqual(await service(44), { rating: 1420, win_rate: 67 });
  assert.deepEqual(calls, [
    { sql: RATING_SQL, params: [44] },
    { sql: STATS_SQL, params: [44] },
  ]);
});

test("opponent card preserves missing-rating and empty-history defaults", async () => {
  const responses = [
    { rows: [] },
    { rows: [{ total: "0", wins: "0" }] },
  ];
  const service = createOpponentCardService({
    pool: { async query() { return responses.shift(); } },
  });

  assert.deepEqual(await service(12), { rating: 1000, win_rate: 0 });
});

test("opponent card preserves database-error fallback", async () => {
  const service = createOpponentCardService({
    pool: { async query() { throw new Error("database unavailable"); } },
  });

  await assert.doesNotReject(() => service(5));
  assert.deepEqual(await service(5), { rating: 1000, win_rate: 0 });
});
