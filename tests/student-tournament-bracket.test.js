const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createStudentTournamentBracketService,
} = require("../src/services/studentTournamentBracketService");
const {
  createStudentTournamentBracketController,
} = require("../src/controllers/studentTournamentBracketController");
const studentTournamentBracketRoutes = require("../src/routes/studentTournamentBracketRoutes");

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

test("student tournament bracket preserves SQL, grouping, mutation, and response", async () => {
  const tournament = {
    id: 9,
    name: "Cup",
    status: "active",
    bracket_size: 4,
    scope_value: "Chilonzor",
    region: "Tashkent",
  };
  const schools = [{ school: "School 1", school_key: "school-1" }];
  const matches = [
    { id: 1, round: 1, match_no: 1, school_a_key: "school-1", school_b_key: "school-2" },
    { id: 2, round: 2, match_no: 1, school_a_key: "school-3", school_b_key: "school-4" },
  ];
  const queries = [];
  const responses = [
    { rows: [{ school: "School 1", school_key: "school-1" }] },
    { rows: [tournament] },
    { rows: schools },
    { rows: matches },
  ];
  const service = createStudentTournamentBracketService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.deepEqual(await service.getBracket("9", 5), {
    status: "found",
    result: {
      tournament,
      my_school: "School 1",
      my_school_key: "school-1",
      schools,
      rounds: { 1: [matches[0]], 2: [matches[1]] },
      total_rounds: 2,
    },
  });
  assert.equal(matches[0].is_mine, true);
  assert.equal(matches[1].is_mine, false);
  assert.deepEqual(queries[0], {
    sql: "SELECT school, school_key FROM tournament_team_members WHERE tournament_id = $1 AND user_id = $2 LIMIT 1",
    params: ["9", 5],
  });
  assert.equal(queries.length, 4);
  assert.deepEqual(queries.map((query) => query.params), [["9", 5], ["9"], ["9"], ["9"]]);
});

test("student tournament bracket preserves membership and tournament early returns", async () => {
  let calls = 0;
  const notMemberService = createStudentTournamentBracketService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });
  assert.deepEqual(await notMemberService.getBracket("9", 5), { status: "not-member" });
  assert.equal(calls, 1);

  const responses = [
    { rows: [{ school: "School 1", school_key: "school-1" }] },
    { rows: [] },
  ];
  const notFoundService = createStudentTournamentBracketService({
    pool: { async query() { return responses.shift(); } },
  });
  assert.deepEqual(await notFoundService.getBracket("9", 5), { status: "not-found" });
});

test("student tournament bracket controller preserves responses and error logging", async () => {
  const forbiddenController = createStudentTournamentBracketController({
    pool: { async query() { return { rows: [] }; } },
  });
  const forbiddenResponse = createResponse();
  await forbiddenController.getBracket(
    { user: { id: 5 }, params: { id: "9" } },
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.deepEqual(forbiddenResponse.body, { error: "Siz bu turnir ishtirokchisi emassiz" });

  const errorController = createStudentTournamentBracketController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getBracket(
      { user: { id: 5 }, params: { id: "9" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Student bracket xatosi:", "database unavailable"]]);
});

test("student tournament bracket route preserves path and middleware order", () => {
  const router = studentTournamentBracketRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/tournaments/:id/bracket");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
