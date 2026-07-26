const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminTournamentListController,
} = require("../src/controllers/adminTournamentListController");
const createAdminTournamentListRoutes = require("../src/routes/adminTournamentListRoutes");

const LIST_SQL = `SELECT t.*,
                  (SELECT COUNT(*) FROM tournament_schools ts WHERE ts.tournament_id = t.id) AS school_count
           FROM tournaments t
           ORDER BY t.created_at DESC`;

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

test("admin tournament list preserves aggregate query and response", async () => {
  const tournaments = [
    { id: 2, name: "Second", school_count: "4" },
    { id: 1, name: "First", school_count: "2" },
  ];
  const calls = [];
  const controller = createAdminTournamentListController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows: tournaments };
      },
    },
  });
  const response = createResponse();

  assert.equal(await controller.list({}, response), undefined);
  assert.deepEqual(calls, [[LIST_SQL, undefined]]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { tournaments });
  assert.equal(response.body.tournaments, tournaments);
});

test("admin tournament list preserves safe database-error response", async () => {
  const logs = [];
  const controller = createAdminTournamentListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  assert.equal(await controller.list({}, response), undefined);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Turnirlar ro'yxati xatosi:", "database unavailable"]]);
});

test("admin tournament list route preserves path, method, and middleware order", () => {
  const router = createAdminTournamentListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/tournaments/list");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
