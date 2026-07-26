const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminTournamentDeleteController,
} = require("../src/controllers/adminTournamentDeleteController");
const createAdminTournamentDeleteRoutes = require("../src/routes/adminTournamentDeleteRoutes");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

function createHarness({ exists = true, connectError, queryErrorAt, rollbackError } = {}) {
  const calls = [];
  let queryNumber = 0;
  const client = {
    async query(sql, params) {
      queryNumber++;
      const normalized = normalizeSql(sql);
      calls.push(["query", normalized, params]);
      if (normalized === "ROLLBACK" && rollbackError) throw rollbackError;
      if (queryNumber === queryErrorAt) throw new Error("delete failed");
      if (normalized.startsWith("SELECT id FROM tournaments")) {
        return { rows: exists ? [{ id: 12 }] : [] };
      }
      return { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const controller = createAdminTournamentDeleteController({
    pool: {
      async connect() {
        calls.push(["connect"]);
        if (connectError) throw connectError;
        return client;
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

test("admin tournament delete preserves connection error propagation", async () => {
  const connectError = new Error("connect failed");
  const harness = createHarness({ connectError });

  await assert.rejects(
    () => harness.controller.remove({ params: { id: "12" } }, createResponse()),
    (error) => error === connectError
  );
  assert.deepEqual(harness.calls, [["connect"]]);
});

test("admin tournament delete preserves not-found release and response", async () => {
  const harness = createHarness({ exists: false });
  const response = createResponse();

  const result = await harness.controller.remove({ params: { id: "404" } }, response);

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [
    ["connect"],
    ["query", "SELECT id FROM tournaments WHERE id = $1", ["404"]],
    ["release"],
  ]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Turnir topilmadi" });
});

test("admin tournament delete preserves transaction query and release order", async () => {
  const harness = createHarness();
  const response = createResponse();

  assert.equal(await harness.controller.remove({ params: { id: "12" } }, response), undefined);

  assert.deepEqual(harness.calls, [
    ["connect"],
    ["query", "SELECT id FROM tournaments WHERE id = $1", ["12"]],
    ["query", "BEGIN", undefined],
    [
      "query",
      "DELETE FROM tournament_match_players WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = $1)",
      ["12"],
    ],
    ["query", "DELETE FROM tournament_matches WHERE tournament_id = $1", ["12"]],
    ["query", "DELETE FROM tournament_team_members WHERE tournament_id = $1", ["12"]],
    ["query", "DELETE FROM tournament_schools WHERE tournament_id = $1", ["12"]],
    ["query", "DELETE FROM tournaments WHERE id = $1", ["12"]],
    ["query", "COMMIT", undefined],
    ["release"],
  ]);
  assert.deepEqual(response.body, { success: true });
});

test("admin tournament delete preserves rollback, release, log, and error response", async () => {
  const harness = createHarness({ queryErrorAt: 5 });
  const response = createResponse();

  assert.equal(await harness.controller.remove({ params: { id: "12" } }, response), undefined);

  assert.deepEqual(harness.calls.slice(-3), [
    ["query", "ROLLBACK", undefined],
    ["release"],
    ["error", "Turnir o'chirish xatosi:", "delete failed"],
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi: delete failed" });
});

test("admin tournament delete preserves rollback-error propagation before release", async () => {
  const rollbackError = new Error("rollback failed");
  const harness = createHarness({ queryErrorAt: 4, rollbackError });

  await assert.rejects(
    () => harness.controller.remove({ params: { id: "12" } }, createResponse()),
    (error) => error === rollbackError
  );
  assert.equal(harness.calls.at(-1)[1], "ROLLBACK");
  assert.equal(harness.calls.some((call) => call[0] === "release"), false);
  assert.equal(harness.calls.some((call) => call[0] === "error"), false);
});

test("admin tournament delete route preserves path, method, and middleware order", () => {
  const router = createAdminTournamentDeleteRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/tournaments/:id/delete");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
