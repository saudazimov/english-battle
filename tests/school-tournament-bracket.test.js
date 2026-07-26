const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSchoolTournamentBracketController,
} = require("../src/controllers/schoolTournamentBracketController");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("school tournament bracket preserves school-admin rejection", async () => {
  let queryCount = 0;
  const controller = createSchoolTournamentBracketController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async getSchoolAdmin() { return { ok: false, error: "Faqat maktab admini uchun" }; },
  });
  const res = createResponse();

  await controller.getBracket({ user: { id: 42 }, params: { id: "9" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Faqat maktab admini uchun" });
});

test("school tournament bracket preserves tournament-not-found response", async () => {
  const queries = [];
  const controller = createSchoolTournamentBracketController({
    pool: { async query(sql, params) { queries.push({ sql, params }); return { rows: [] }; } },
    async getSchoolAdmin() { return { ok: true, user: { school_key: "r|d|s" } }; },
  });
  const res = createResponse();

  await controller.getBracket({ user: { id: 42 }, params: { id: "9" } }, res);

  assert.deepEqual(queries, [{ sql: "SELECT * FROM tournaments WHERE id = $1", params: ["9"] }]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Turnir topilmadi" });
});

test("school tournament bracket preserves queries, grouping and response", async () => {
  const tournament = {
    id: 9, name: "Final", status: "active", bracket_size: 8, level: "district",
    scope_value: "D", region: "R", team_size: 5,
  };
  const participation = { seed: 2, eliminated: false, placement: null };
  const schools = [{ school: "1-maktab", school_key: "r|d|s", seed: 2 }];
  const matches = [
    { id: 1, round: 1, match_no: 1, school_a_key: "r|d|s", school_b_key: "other" },
    { id: 2, round: 1, match_no: 2, school_a_key: "a", school_b_key: "b" },
    { id: 3, round: 2, match_no: 1, school_a_key: "other", school_b_key: "r|d|s" },
  ];
  const results = [
    { rows: [tournament] }, { rows: [participation] }, { rows: schools }, { rows: matches },
  ];
  const queries = [];
  const controller = createSchoolTournamentBracketController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return results.shift();
      },
    },
    async getSchoolAdmin() {
      return { ok: true, user: { school: "1-maktab", school_key: "r|d|s" } };
    },
  });
  const res = createResponse();

  await controller.getBracket({ user: { id: 42 }, params: { id: "9" } }, res);

  assert.deepEqual(queries, [
    { sql: "SELECT * FROM tournaments WHERE id = $1", params: ["9"] },
    {
      sql: "SELECT seed, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 AND school_key = $2",
      params: ["9", "r|d|s"],
    },
    {
      sql: "SELECT school, region, district, school_key, seed, avg_rating, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 ORDER BY seed ASC",
      params: ["9"],
    },
    {
      sql: `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
              winner_school, winner_school_key, status, scheduled_at, started_at, finished_at
       FROM tournament_matches
       WHERE tournament_id = $1
       ORDER BY round ASC, match_no ASC`,
      params: ["9"],
    },
  ]);
  assert.deepEqual(res.body, {
    tournament,
    my_school: "1-maktab",
    my_school_key: "r|d|s",
    my_participation: participation,
    schools,
    rounds: {
      1: [matches[0], matches[1]],
      2: [matches[2]],
    },
    total_rounds: 3,
  });
  assert.deepEqual(matches.map((match) => match.is_mine), [true, false, true]);
});

test("school tournament bracket preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createSchoolTournamentBracketController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async getSchoolAdmin() { return { ok: true, user: { school_key: "r|d|s" } }; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.getBracket({ user: { id: 42 }, params: { id: "9" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["School bracket xatosi:", "database unavailable"]]);
});
