const test = require("node:test");
const assert = require("node:assert/strict");

const { propagateByes } = require("../src/services/tournamentByePropagationService");

const SELECT_SQL = "SELECT match_no, winner_school, winner_school_key FROM tournament_matches WHERE tournament_id = $1 AND round = 1 AND status = 'done' ORDER BY match_no";
const UPDATE_A_SQL = "UPDATE tournament_matches SET school_a = $1, school_a_key = $2 WHERE tournament_id = $3 AND round = 2 AND match_no = $4";
const UPDATE_B_SQL = "UPDATE tournament_matches SET school_b = $1, school_b_key = $2 WHERE tournament_id = $3 AND round = 2 AND match_no = $4";

test("tournament bye propagation preserves odd/even bracket placement", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return {
          rows: [
            { match_no: 1, winner_school: "1-maktab", winner_school_key: "school-a" },
            { match_no: 2, winner_school: "2-maktab", winner_school_key: "school-b" },
            { match_no: 3, winner_school: "3-maktab", winner_school_key: "school-c" },
            { match_no: 4, winner_school: "4-maktab", winner_school_key: "school-d" },
          ],
        };
      }
      return { rowCount: 1 };
    },
  };

  const result = await propagateByes(client, 17);

  assert.equal(result, undefined);
  assert.deepEqual(calls, [
    { sql: SELECT_SQL, params: [17] },
    { sql: UPDATE_A_SQL, params: ["1-maktab", "school-a", 17, 1] },
    { sql: UPDATE_B_SQL, params: ["2-maktab", "school-b", 17, 1] },
    { sql: UPDATE_A_SQL, params: ["3-maktab", "school-c", 17, 2] },
    { sql: UPDATE_B_SQL, params: ["4-maktab", "school-d", 17, 2] },
  ]);
});

test("tournament bye propagation preserves incomplete-winner skipping", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [
          { match_no: 1, winner_school: null, winner_school_key: "school-a" },
          { match_no: 2, winner_school: "2-maktab", winner_school_key: "" },
        ],
      };
    },
  };

  await propagateByes(client, "tournament-5");

  assert.deepEqual(calls, [{ sql: SELECT_SQL, params: ["tournament-5"] }]);
});

test("tournament bye propagation preserves database-error propagation", async () => {
  const databaseError = new Error("database unavailable");
  const client = { async query() { throw databaseError; } };

  await assert.rejects(
    () => propagateByes(client, 9),
    (error) => error === databaseError
  );
});
