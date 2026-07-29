const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin } = require("../auth");
const {
  createAdminTournamentEditService,
} = require("../src/services/adminTournamentEditService");
const {
  createAdminTournamentEditController,
} = require("../src/controllers/adminTournamentEditController");
const adminTournamentEditRoutes = require("../src/routes/adminTournamentEditRoutes");

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

test("admin tournament edit preserves dynamic SQL field and parameter order", async () => {
  const queries = [];
  const updated = { id: 7, name: "New Cup" };
  const responses = [
    { rows: [{ id: 7, status: "registration" }] },
    { rows: [updated] },
  ];
  const service = createAdminTournamentEditService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });
  const body = {
    name: "  New Cup  ",
    team_size: "5",
    reserve_size: "2",
    questions_per_match: "20",
    seconds_per_match: "300",
    registration_deadline: "2026-08-01",
    starts_at: "2026-08-02",
    region: "Toshkent",
    district: "Chilonzor",
  };

  assert.deepEqual(await service.editTournament("7", body), {
    status: "updated",
    tournament: updated,
  });
  assert.deepEqual(queries[0], {
    sql: "SELECT * FROM tournaments WHERE id = $1",
    params: ["7"],
  });
  assert.equal(
    queries[1].sql,
    "UPDATE tournaments SET name = $1, registration_deadline = $2, starts_at = $3, team_size = $4, reserve_size = $5, questions_per_match = $6, seconds_per_match = $7, region = $8, scope_value = $9 WHERE id = $10 RETURNING *"
  );
  assert.deepEqual(queries[1].params, [
    "New Cup",
    "2026-08-01",
    "2026-08-02",
    5,
    2,
    20,
    300,
    "Toshkent",
    "Chilonzor",
    "7",
  ]);
});

test("admin tournament edit preserves locked field guards", async () => {
  let calls = 0;
  const service = createAdminTournamentEditService({
    pool: {
      async query() {
        calls += 1;
        return {
          rows: [{
            status: "active",
            team_size: 4,
            region: "Toshkent",
            scope_value: "Chilonzor",
          }],
        };
      },
    },
  });

  assert.deepEqual(await service.editTournament("7", {
    name: "New name",
    team_size: "5",
    reserve_size: "3",
    region: "Samarqand",
    district: "Urgut",
  }), {
    status: "blocked",
    blocked: ["jamoa hajmi", "viloyat", "tuman"],
  });
  assert.equal(calls, 1);
});

test("admin tournament edit preserves not-found, empty, and locked ignored fields", async () => {
  const notFound = createAdminTournamentEditService({
    pool: { async query() { return { rows: [] }; } },
  });
  assert.deepEqual(await notFound.editTournament("7", {}), { status: "not-found" });

  const empty = createAdminTournamentEditService({
    pool: { async query() { return { rows: [{ status: "draft" }] }; } },
  });
  assert.deepEqual(await empty.editTournament("7", {
    team_size: 0,
    questions_per_match: 51,
  }), { status: "empty" });

  const locked = createAdminTournamentEditService({
    pool: { async query() { return { rows: [{ status: "active" }] }; } },
  });
  assert.deepEqual(await locked.editTournament("7", {
    reserve_size: 2,
    questions_per_match: 10,
    seconds_per_match: 120,
  }), { status: "empty" });
});

test("admin tournament edit controller preserves blocked and error responses", async () => {
  const blockedController = createAdminTournamentEditController({
    pool: {
      async query() {
        return {
          rows: [{ status: "active", team_size: 4, region: "A", scope_value: "B" }],
        };
      },
    },
  });
  const blockedResponse = createResponse();
  await blockedController.edit({
    params: { id: "7" },
    body: { team_size: 5, region: "C", district: "D" },
  }, blockedResponse);
  assert.equal(blockedResponse.statusCode, 400);
  assert.deepEqual(blockedResponse.body, {
    error: "Setka tuzilgani uchun o'zgartirib bo'lmaydi: jamoa hajmi, viloyat, tuman",
  });

  const errorController = createAdminTournamentEditController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.edit({ params: { id: "7" }, body: {} }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi: database unavailable" });
  assert.deepEqual(logged, [["Turnir tahrirlash xatosi:", "database unavailable"]]);
});

test("admin tournament edit route preserves path and middleware order", () => {
  const router = adminTournamentEditRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/admin/tournaments/:id/edit");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, requireAdmin);
  assert.equal(layer.route.stack.length, 2);
});
