const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminOverviewController,
} = require("../src/controllers/adminOverviewController");
const createAdminOverviewRoutes = require("../src/routes/adminOverviewRoutes");

const expectedQueries = [
  "SELECT COUNT(*) AS c FROM questions",
  "SELECT COUNT(*) AS c FROM users WHERE role = 'student'",
  "SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' OR role = 'school_admin'",
  "SELECT COUNT(DISTINCT school) AS c FROM users WHERE school IS NOT NULL AND school != ''",
  "SELECT COUNT(*) AS c FROM battle_history",
  "SELECT COUNT(*) AS c FROM users WHERE last_active_date = CURRENT_DATE",
  "SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 5",
  "SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM questions WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' GROUP BY day ORDER BY day",
];

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

function createHarness({ errorAt } = {}) {
  const calls = [];
  const results = [
    { rows: [{ c: "101" }] },
    { rows: [{ c: "52" }] },
    { rows: [{ c: "13" }] },
    { rows: [{ c: "7" }] },
    { rows: [{ c: "222" }] },
    { rows: [{ c: "19" }] },
    { rows: [{ region: "Toshkent", c: "12" }, { region: "Samarqand", c: "8" }] },
    { rows: [{ day: "2026-07-25", c: "3" }, { day: "2026-07-26", c: "5" }] },
  ];
  const controller = createAdminOverviewController({
    pool: {
      async query(sql) {
        const index = calls.length;
        calls.push(["query", sql]);
        if (index + 1 === errorAt) throw new Error("database failed");
        return results[index];
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

test("admin overview preserves query order, parsing, and response mapping", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.getOverview({}, response);

  assert.deepEqual(
    harness.calls,
    expectedQueries.map((sql) => ["query", sql])
  );
  assert.deepEqual(response.body, {
    totalQuestions: 101,
    totalStudents: 52,
    totalTeachers: 13,
    totalSchools: 7,
    totalBattles: 222,
    activeToday: 19,
    topRegions: [
      { name: "Toshkent", count: 12 },
      { name: "Samarqand", count: 8 },
    ],
    questionGrowth: [
      { day: "2026-07-25", count: 3 },
      { day: "2026-07-26", count: 5 },
    ],
  });
});

test("admin overview preserves Promise.all query launch and error response", async () => {
  const harness = createHarness({ errorAt: 3 });
  const response = createResponse();

  await harness.controller.getOverview({}, response);

  assert.deepEqual(
    harness.calls.slice(0, 8),
    expectedQueries.map((sql) => ["query", sql])
  );
  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Overview xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin overview route preserves path, method, and middleware order", () => {
  const router = createAdminOverviewRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/overview");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
