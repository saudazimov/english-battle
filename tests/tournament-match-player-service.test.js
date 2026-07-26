const test = require("node:test");
const assert = require("node:assert/strict");

const { createTournamentMatchPlayerService } = require("../src/services/tournamentMatchPlayerService");

const MATCH_PLAYER_SQL = `SELECT mp.id, mp.match_id, mp.user_id, mp.school, mp.school_key, mp.checked_in, mp.score, mp.finished,
              tm.member_role, tm.slot_order
       FROM tournament_match_players mp
       LEFT JOIN tournament_team_members tm
         ON tm.tournament_id = (SELECT tournament_id FROM tournament_matches WHERE id = mp.match_id)
         AND tm.user_id = mp.user_id
       WHERE mp.match_id = $1 AND mp.user_id = $2`;

test("tournament match-player lookup preserves SQL and first-row response", async () => {
  const calls = [];
  const firstRow = { id: 10, match_id: 5, user_id: 44, checked_in: true };
  const service = createTournamentMatchPlayerService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [firstRow, { id: 11 }] };
      },
    },
  });

  const result = await service(5, 44);

  assert.equal(result, firstRow);
  assert.deepEqual(calls, [{ sql: MATCH_PLAYER_SQL, params: [5, 44] }]);
});

test("tournament match-player lookup preserves null response", async () => {
  const service = createTournamentMatchPlayerService({
    pool: { async query() { return { rows: [] }; } },
  });

  assert.equal(await service("match-7", "user-9"), null);
});

test("tournament match-player lookup preserves database-error propagation", async () => {
  const databaseError = new Error("database unavailable");
  const service = createTournamentMatchPlayerService({
    pool: { async query() { throw databaseError; } },
  });

  await assert.rejects(() => service(2, 3), (error) => error === databaseError);
});
