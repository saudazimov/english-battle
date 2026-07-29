const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin } = require("../auth");
const {
  createAdminTournamentCreateService,
} = require("../src/services/adminTournamentCreateService");
const {
  createAdminTournamentCreateController,
} = require("../src/controllers/adminTournamentCreateController");
const adminTournamentCreateRoutes = require("../src/routes/adminTournamentCreateRoutes");

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

test("admin tournament create preserves SQL order and insert parameters", async () => {
  const tournament = { id: 9, name: "District Cup" };
  const queries = [];
  const service = createAdminTournamentCreateService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1 ? { rows: [{ c: "3" }] } : { rows: [tournament] };
      },
    },
  });

  assert.deepEqual(await service.createTournament({
    name: "District Cup",
    region: "Tashkent",
    district: "Chilonzor",
    teamSize: 5,
    reserveSize: 2,
    questionsPerMatch: 20,
    secondsPerMatch: 300,
    registrationDeadline: "",
    startsAt: null,
  }), { schoolCount: 3, tournament });
  assert.deepEqual(queries, [
    {
      sql: `SELECT COUNT(DISTINCT school) AS c FROM users
       WHERE region = $1 AND district = $2
         AND school IS NOT NULL AND school <> ''
         AND (role = 'student' OR role IS NULL)`,
      params: ["Tashkent", "Chilonzor"],
    },
    {
      sql: `INSERT INTO tournaments
        (name, level, scope_value, region, status, team_size, reserve_size,
         questions_per_match, seconds_per_match, registration_deadline, starts_at, created_by)
       VALUES ($1, 'district', $2, $3, 'registration', $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      params: ["District Cup", "Chilonzor", "Tashkent", 5, 2, 20, 300, null, null, null],
    },
  ]);
});

test("admin tournament create preserves minimum school result", async () => {
  let calls = 0;
  const service = createAdminTournamentCreateService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [{ c: "1" }] };
      },
    },
  });

  assert.deepEqual(await service.createTournament({
    region: "Tashkent",
    district: "Chilonzor",
  }), { schoolCount: 1, tournament: null });
  assert.equal(calls, 1);
});

test("admin tournament create controller preserves validation and defaults", async () => {
  const invalidController = createAdminTournamentCreateController({
    pool: { query: assert.fail },
    sanitizeText: assert.fail,
  });
  const missingNameResponse = createResponse();
  await invalidController.createTournament({ body: {} }, missingNameResponse);
  assert.equal(missingNameResponse.statusCode, 400);
  assert.deepEqual(missingNameResponse.body, { error: "Turnir nomi kerak" });

  const calls = [];
  const controller = createAdminTournamentCreateController({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return calls.length === 1
          ? { rows: [{ c: "2" }] }
          : { rows: [{ id: 9, name: "Safe" }] };
      },
    },
    sanitizeText(value, limit) {
      assert.equal(value, "  Cup  ");
      assert.equal(limit, 200);
      return "Safe";
    },
  });
  const response = createResponse();
  await controller.createTournament({
    body: { name: "  Cup  ", region: "Tashkent", district: "Chilonzor" },
  }, response);
  assert.deepEqual(response.body, {
    success: true,
    tournament: { id: 9, name: "Safe" },
    eligible_schools: 2,
  });
  assert.deepEqual(calls[1].params.slice(3, 7), [5, 2, 20, 300]);
});

test("admin tournament create preserves error response and logging", async () => {
  const controller = createAdminTournamentCreateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    sanitizeText(value) { return value; },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.createTournament({
      body: { name: "Cup", region: "Tashkent", district: "Chilonzor" },
    }, response);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi: database unavailable" });
  assert.deepEqual(logged, [["Turnir yaratish xatosi:", "database unavailable"]]);
});

test("admin tournament create route preserves path and middleware order", () => {
  const router = adminTournamentCreateRoutes({
    pool: { query: assert.fail },
    sanitizeText: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/admin/tournaments/create");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, requireAdmin);
  assert.equal(layer.route.stack.length, 2);
});
