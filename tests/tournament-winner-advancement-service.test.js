const test = require("node:test");
const assert = require("node:assert/strict");

const { createTournamentWinnerAdvancementService } = require("../src/services/tournamentWinnerAdvancementService");

const CURRENT_MATCH_SQL = `SELECT school_a_key, school_b_key
     FROM tournament_matches
     WHERE tournament_id = $1 AND round = $2 AND match_no = $3`;
const ELIMINATE_SQL = "UPDATE tournament_schools SET eliminated = true WHERE tournament_id = $1 AND school_key = $2";
const NEXT_MATCH_SQL = "SELECT id FROM tournament_matches WHERE tournament_id = $1 AND round = $2 AND match_no = $3";
const PLACE_CHAMPION_SQL = "UPDATE tournament_schools SET placement = 1 WHERE tournament_id = $1 AND school_key = $2";
const FINAL_MATCH_SQL = "SELECT school_a, school_b, school_a_key, school_b_key FROM tournament_matches WHERE tournament_id = $1 AND round = $2 AND match_no = $3";
const PLACE_RUNNER_UP_SQL = "UPDATE tournament_schools SET placement = 2 WHERE tournament_id = $1 AND school_key = $2";
const FINISH_TOURNAMENT_SQL = "UPDATE tournaments SET status = 'finished' WHERE id = $1";

test("winner advancement preserves missing-winner early return", async () => {
  let queryCalls = 0;
  const service = createTournamentWinnerAdvancementService({
    logger: { log() { throw new Error("must not log"); } },
  });
  const client = { async query() { queryCalls += 1; } };

  assert.equal(await service(client, 1, 1, 1, null, "key"), undefined);
  assert.equal(await service(client, 1, 1, 1, "School", ""), undefined);
  assert.equal(queryCalls, 0);
});

test("winner advancement preserves odd next-round placement and elimination", async () => {
  const calls = [];
  const responses = [
    { rows: [{ school_a_key: "school-a", school_b_key: "school-b" }] },
    { rowCount: 1 },
    { rows: [{ id: 90 }] },
    { rowCount: 1 },
  ];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return responses.shift();
    },
  };
  const service = createTournamentWinnerAdvancementService({
    logger: { log() { throw new Error("must not finish tournament"); } },
  });

  await service(client, 12, 1, 3, "1-maktab", "school-a");

  assert.deepEqual(calls, [
    { sql: CURRENT_MATCH_SQL, params: [12, 1, 3] },
    { sql: ELIMINATE_SQL, params: [12, "school-b"] },
    { sql: NEXT_MATCH_SQL, params: [12, 2, 2] },
    {
      sql: "UPDATE tournament_matches SET school_a = $1, school_a_key = $2 WHERE id = $3",
      params: ["1-maktab", "school-a", 90],
    },
  ]);
});

test("winner advancement preserves even next-round placement", async () => {
  const calls = [];
  const responses = [
    { rows: [] },
    { rows: [{ id: 91 }] },
    { rowCount: 1 },
  ];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return responses.shift();
    },
  };
  const service = createTournamentWinnerAdvancementService({
    logger: { log() { throw new Error("must not finish tournament"); } },
  });

  await service(client, 12, 1, 4, "2-maktab", "school-b");

  assert.deepEqual(calls, [
    { sql: CURRENT_MATCH_SQL, params: [12, 1, 4] },
    { sql: NEXT_MATCH_SQL, params: [12, 2, 2] },
    {
      sql: "UPDATE tournament_matches SET school_b = $1, school_b_key = $2 WHERE id = $3",
      params: ["2-maktab", "school-b", 91],
    },
  ]);
});

test("winner advancement preserves final placements and tournament finish", async () => {
  const calls = [];
  const logs = [];
  const responses = [
    { rows: [{ school_a_key: "school-a", school_b_key: "school-b" }] },
    { rowCount: 1 },
    { rows: [] },
    { rowCount: 1 },
    {
      rows: [{
        school_a: "1-maktab",
        school_b: "2-maktab",
        school_a_key: "school-a",
        school_b_key: "school-b",
      }],
    },
    { rowCount: 1 },
    { rowCount: 1 },
  ];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return responses.shift();
    },
  };
  const service = createTournamentWinnerAdvancementService({
    logger: { log(...args) { logs.push(args); } },
  });

  await service(client, 20, 3, 1, "1-maktab", "school-a");

  assert.deepEqual(calls, [
    { sql: CURRENT_MATCH_SQL, params: [20, 3, 1] },
    { sql: ELIMINATE_SQL, params: [20, "school-b"] },
    { sql: NEXT_MATCH_SQL, params: [20, 4, 1] },
    { sql: PLACE_CHAMPION_SQL, params: [20, "school-a"] },
    { sql: FINAL_MATCH_SQL, params: [20, 3, 1] },
    { sql: PLACE_RUNNER_UP_SQL, params: [20, "school-b"] },
    { sql: FINISH_TOURNAMENT_SQL, params: [20] },
  ]);
  assert.deepEqual(logs, [["[Turnir] Turnir #20 YAKUNLANDI — Chempion: 1-maktab"]]);
});

test("winner advancement preserves database-error propagation", async () => {
  const databaseError = new Error("database unavailable");
  const service = createTournamentWinnerAdvancementService({
    logger: { log() { throw new Error("must not log"); } },
  });

  await assert.rejects(
    () => service(
      { async query() { throw databaseError; } },
      1,
      1,
      1,
      "School",
      "key"
    ),
    (error) => error === databaseError
  );
});
