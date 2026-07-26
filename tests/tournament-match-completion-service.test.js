const test = require("node:test");
const assert = require("node:assert/strict");

const { createTournamentMatchCompletionService } = require("../src/services/tournamentMatchCompletionService");

const FINISH_MATCH_SQL = `UPDATE tournament_matches
     SET status = 'done', winner_school = $1, winner_school_key = $2,
         score_a = $3, score_b = $4, finished_at = NOW()
     WHERE id = $5`;

test("tournament match completion preserves UPDATE and advance order", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ type: "query", sql, params });
    },
  };
  const match = { id: 18, tournament_id: 4, round: 2, match_no: 3 };
  const service = createTournamentMatchCompletionService({
    async advanceWinner(...args) {
      calls.push({ type: "advance", args });
    },
  });

  const result = await service(
    client,
    match,
    "1-maktab",
    "school-a",
    5,
    2,
    true
  );

  assert.equal(result, undefined);
  assert.deepEqual(calls, [
    {
      type: "query",
      sql: FINISH_MATCH_SQL,
      params: ["1-maktab", "school-a", 5, 2, 18],
    },
    {
      type: "advance",
      args: [client, 4, 2, 3, "1-maktab", "school-a"],
    },
  ]);
});

test("tournament match completion preserves query-error propagation", async () => {
  const databaseError = new Error("database unavailable");
  let advanceCalls = 0;
  const service = createTournamentMatchCompletionService({
    async advanceWinner() { advanceCalls += 1; },
  });

  await assert.rejects(
    () => service(
      { async query() { throw databaseError; } },
      { id: 1 },
      "A",
      "a",
      0,
      0,
      false
    ),
    (error) => error === databaseError
  );
  assert.equal(advanceCalls, 0);
});

test("tournament match completion preserves advance-error propagation", async () => {
  const advanceError = new Error("advance failed");
  let queryCalls = 0;
  const service = createTournamentMatchCompletionService({
    async advanceWinner() { throw advanceError; },
  });

  await assert.rejects(
    () => service(
      { async query() { queryCalls += 1; } },
      { id: 1, tournament_id: 2, round: 1, match_no: 1 },
      "A",
      "a",
      1,
      0,
      true
    ),
    (error) => error === advanceError
  );
  assert.equal(queryCalls, 1);
});
