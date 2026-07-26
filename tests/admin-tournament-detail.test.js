const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminTournamentDetailController,
} = require("../src/controllers/adminTournamentDetailController");
const createAdminTournamentDetailRoutes = require("../src/routes/adminTournamentDetailRoutes");

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

test("admin tournament detail preserves parameterized query and response", async () => {
  const tournament = { id: 17, name: "School Cup", status: "registration" };
  const calls = [];
  const controller = createAdminTournamentDetailController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows: [tournament] };
      },
    },
  });
  const response = createResponse();

  assert.equal(await controller.get({ params: { id: "17" } }, response), undefined);
  assert.deepEqual(calls, [["SELECT * FROM tournaments WHERE id = $1", ["17"]]]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { tournament });
});

test("admin tournament detail preserves not-found response", async () => {
  const controller = createAdminTournamentDetailController({
    pool: { async query() { return { rows: [] }; } },
  });
  const response = createResponse();

  const result = await controller.get({ params: { id: "404" } }, response);

  assert.equal(result, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Turnir topilmadi" });
});

test("admin tournament detail preserves safe database-error response", async () => {
  const logs = [];
  const controller = createAdminTournamentDetailController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  assert.equal(await controller.get({ params: { id: "17" } }, response), undefined);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Turnir olish xatosi:", "database unavailable"]]);
});

test("admin tournament detail route preserves path, method, and middleware order", () => {
  const router = createAdminTournamentDetailRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/tournaments/:id");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
