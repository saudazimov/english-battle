const test = require("node:test");
const assert = require("node:assert/strict");

const { getSeededWinner } = require("../src/services/seededWinnerService");

const SEEDED_SQL = `SELECT school, school_key
     FROM tournament_schools
     WHERE tournament_id = $1 AND school_key = ANY($2::text[])
     ORDER BY seed ASC NULLS LAST, avg_rating DESC, school_key ASC
     LIMIT 1`;

test("seeded winner preserves query parameters and first-row response", async () => {
  const calls = [];
  const winner = { school: "1-maktab", school_key: "school-a" };
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [winner, { school: "2-maktab", school_key: "school-b" }] };
    },
  };

  const result = await getSeededWinner(
    client,
    17,
    "1-maktab",
    "school-a",
    "2-maktab",
    "school-b"
  );

  assert.equal(result, winner);
  assert.deepEqual(calls, [{
    sql: SEEDED_SQL,
    params: [17, ["school-a", "school-b"]],
  }]);
});

test("seeded winner preserves key filtering and fallback response", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };

  const result = await getSeededWinner(
    client,
    22,
    "1-maktab",
    "",
    "2-maktab",
    "school-b"
  );

  assert.deepEqual(calls, [{ sql: SEEDED_SQL, params: [22, ["school-b"]] }]);
  assert.deepEqual(result, { school: "1-maktab", school_key: "school-b" });
});

test("seeded winner preserves database-error propagation", async () => {
  const databaseError = new Error("database unavailable");
  const client = { async query() { throw databaseError; } };

  await assert.rejects(
    () => getSeededWinner(client, 3, "A", "a", "B", "b"),
    (error) => error === databaseError
  );
});
