const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin } = require("../auth");
const {
  createAdminTournamentBracketService,
} = require("../src/services/adminTournamentBracketService");
const {
  createAdminTournamentBracketController,
} = require("../src/controllers/adminTournamentBracketController");
const adminTournamentBracketRoutes = require("../src/routes/adminTournamentBracketRoutes");

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

test("admin tournament bracket preserves SQL order, grouping, and response", async () => {
  const tournamentRow = {
    id: 9,
    name: "Cup",
    status: "active",
    bracket_size: 8,
    level: "district",
    scope_value: "Chilonzor",
    region: "Tashkent",
    team_size: 5,
    extra: "not returned",
  };
  const schools = [{ school: "School 1", seed: 1 }];
  const matches = [
    { id: 1, round: 1, match_no: 1 },
    { id: 2, round: 1, match_no: 2 },
    { id: 3, round: 2, match_no: 1 },
  ];
  const queries = [];
  const responses = [{ rows: [tournamentRow] }, { rows: schools }, { rows: matches }];
  const service = createAdminTournamentBracketService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.deepEqual(await service.getBracket("9"), {
    tournament: {
      id: 9,
      name: "Cup",
      status: "active",
      bracket_size: 8,
      level: "district",
      scope_value: "Chilonzor",
      region: "Tashkent",
      team_size: 5,
    },
    schools,
    rounds: { 1: [matches[0], matches[1]], 2: [matches[2]] },
    total_rounds: 3,
  });
  assert.deepEqual(queries, [
    {
      sql: "SELECT * FROM tournaments WHERE id = $1",
      params: ["9"],
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
});

test("admin tournament bracket preserves missing tournament early return", async () => {
  let calls = 0;
  const service = createAdminTournamentBracketService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  assert.equal(await service.getBracket("9"), null);
  assert.equal(calls, 1);
});

test("admin tournament bracket controller preserves responses and error logging", async () => {
  const missingController = createAdminTournamentBracketController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.getBracket({ params: { id: "9" } }, missingResponse);
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Turnir topilmadi" });

  const errorController = createAdminTournamentBracketController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getBracket({ params: { id: "9" } }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Setka o'qish xatosi:", "database unavailable"]]);
});

test("admin tournament bracket route preserves path and middleware order", () => {
  const router = adminTournamentBracketRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/admin/tournaments/:id/bracket");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, requireAdmin);
  assert.equal(layer.route.stack.length, 2);
});
