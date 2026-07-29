const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createStudentTournamentListService,
} = require("../src/services/studentTournamentListService");
const {
  createStudentTournamentListController,
} = require("../src/controllers/studentTournamentListController");
const studentTournamentListRoutes = require("../src/routes/studentTournamentListRoutes");

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

test("student tournament list preserves sequential SQL and priority mapping", async () => {
  const tournamentRows = [
    {
      id: 9,
      name: "Cup 1",
      status: "active",
      level: "district",
      scope_value: "A",
      region: "R",
      member_role: "captain",
      school: "School 1",
      school_key: "school-1",
      bracket_size: 8,
    },
    {
      id: 10,
      name: "Cup 2",
      status: "registration",
      level: "district",
      scope_value: "B",
      region: "R",
      member_role: "player",
      school: "School 1",
      school_key: "school-1",
      bracket_size: null,
    },
  ];
  const matches = [
    { id: 1, status: "done" },
    { id: 2, status: "pending" },
    { id: 3, status: "live" },
  ];
  const queries = [];
  const responses = [
    { rows: [{ school: "School 1" }] },
    { rows: tournamentRows },
    { rows: matches },
    { rows: [] },
  ];
  const service = createStudentTournamentListService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  const result = await service.listTournaments(5);
  assert.equal(result.my_school, "School 1");
  assert.equal(result.tournaments[0].active_match, matches[2]);
  assert.deepEqual(result.tournaments[0].my_matches, matches);
  assert.equal(result.tournaments[1].active_match, null);
  assert.deepEqual(queries[0], {
    sql: "SELECT school FROM users WHERE id = $1",
    params: [5],
  });
  assert.equal(queries.length, 4);
  assert.deepEqual(queries.map((query) => query.params), [
    [5],
    [5],
    [9, "school-1"],
    [10, "school-1"],
  ]);
});

test("student tournament list preserves missing user and empty tournaments response", async () => {
  let calls = 0;
  const service = createStudentTournamentListService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  assert.deepEqual(await service.listTournaments(5), {
    my_school: null,
    tournaments: [],
  });
  assert.equal(calls, 2);
});

test("student tournament list controller preserves response and error logging", async () => {
  const errorController = createStudentTournamentListController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.listTournaments({ user: { id: 5 } }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Student tournaments xatosi:", "database unavailable"]]);
});

test("student tournament list route preserves path and middleware order", () => {
  const router = studentTournamentListRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/tournaments");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
