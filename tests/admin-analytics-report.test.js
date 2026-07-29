const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminAnalyticsReportService,
} = require("../src/services/adminAnalyticsReportService");
const {
  createAdminAnalyticsReportController,
} = require("../src/controllers/adminAnalyticsReportController");
const createAdminAnalyticsReportRoutes = require("../src/routes/adminAnalyticsReportRoutes");

const expectedSql = [
  "SELECT COUNT(*) AS c FROM users",
  "SELECT COUNT(*) AS c FROM battle_history",
  "SELECT COUNT(*) AS c FROM questions",
  "SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'",
  "SELECT COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval",
  "SELECT COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval",
  "SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day",
  "SELECT TO_CHAR(played_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day",
  "SELECT cefr_level, COUNT(*) AS c FROM users WHERE role = 'student' OR role IS NULL GROUP BY cefr_level",
  "SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 6",
  "SELECT school, region, district, COUNT(*) AS c FROM users WHERE school IS NOT NULL AND school != '' GROUP BY school, region, district ORDER BY c DESC LIMIT 6",
];

function createResults() {
  return [
    { rows: [{ c: "100" }] },
    { rows: [{ c: "20" }] },
    { rows: [{ c: "30" }] },
    { rows: [{ c: "4" }] },
    { rows: [{ c: "5" }] },
    { rows: [{ c: "6" }] },
    { rows: [{ day: "2026-07-27", c: "3" }] },
    { rows: [{ day: "2026-07-27", c: "2" }] },
    { rows: [{ cefr_level: null, c: "8" }, { cefr_level: "B2", c: "7" }] },
    { rows: [{ region: "Toshkent", c: "9" }] },
    {
      rows: [
        { school: "1-maktab", region: null, district: "A", c: "6" },
      ],
    },
  ];
}

function createPool(results = createResults()) {
  const calls = [];
  let index = 0;
  return {
    calls,
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return results[index++];
      },
    },
  };
}

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

test("admin analytics service preserves all queries, parameters, and mapping", async () => {
  const harness = createPool();
  const service = createAdminAnalyticsReportService({ pool: harness.pool });

  const report = await service.getReport(7);

  assert.equal(harness.calls.length, 11);
  assert.deepEqual(
    harness.calls.map((call) => call[0]),
    expectedSql
  );
  assert.deepEqual(
    harness.calls.map((call) => call[1]),
    [undefined, undefined, undefined, undefined, [6], [6], [6], [6], undefined, undefined, undefined]
  );
  assert.deepEqual(report, {
    days: 7,
    totals: {
      users: 100,
      battles: 20,
      questions: 30,
      pendingFlags: 4,
      newUsers: 5,
      periodBattles: 6,
    },
    userGrowth: [{ day: "2026-07-27", count: 3 }],
    battleActivity: [{ day: "2026-07-27", count: 2 }],
    levelDistribution: [
      { level: "A1", count: 8 },
      { level: "B2", count: 7 },
    ],
    topRegions: [{ name: "Toshkent", count: 9 }],
    topSchools: [{ name: "1-maktab", region: "—", count: 6 }],
  });
});

test("admin analytics controller preserves invalid-days fallback", async () => {
  const harness = createPool();
  const controller = createAdminAnalyticsReportController({ pool: harness.pool });
  const response = createResponse();

  await controller.report({ query: { days: "8" } }, response);

  assert.equal(response.body.days, 30);
  assert.deepEqual(harness.calls[4][1], [29]);
  assert.deepEqual(harness.calls[7][1], [29]);
});

test("admin analytics controller preserves error logging and response", async () => {
  const logs = [];
  const controller = createAdminAnalyticsReportController({
    pool: {
      async query() {
        throw new Error("database failed");
      },
    },
    logger: {
      error(...args) {
        logs.push(args);
      },
    },
  });
  const response = createResponse();

  await controller.report({ query: {} }, response);

  assert.deepEqual(logs, [["Hisobotlar xatosi:", "database failed"]]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin analytics route preserves path, method, and middleware order", () => {
  const router = createAdminAnalyticsReportRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/reports");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
