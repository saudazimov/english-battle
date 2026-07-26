const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminSchoolListController,
} = require("../src/controllers/adminSchoolListController");
const createAdminSchoolListRoutes = require("../src/routes/adminSchoolListRoutes");

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

function createHarness({ total = "2", rows, errorAt } = {}) {
  const calls = [];
  let queryCount = 0;
  const schoolRows = rows || [
    {
      school: "12-maktab",
      student_count: "15",
      avg_rating: "1420",
      region: "Toshkent",
      district: "Chilonzor",
    },
    {
      school: "5-maktab",
      student_count: "3",
      avg_rating: null,
      region: null,
      district: "",
    },
  ];
  const controller = createAdminSchoolListController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === errorAt) throw new Error("database failed");
        if (sql.startsWith("SELECT COUNT")) return { rows: [{ total }] };
        return { rows: schoolRows };
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

test("admin school list preserves default grouped SQL and response mapping", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.list({ query: {} }, response);

  assert.deepEqual(harness.calls, [
    [
      "query",
      "SELECT COUNT(*) AS total FROM (SELECT school, region, district FROM users WHERE school IS NOT NULL AND school != '' GROUP BY school, region, district) AS sub",
      [],
    ],
    [
      "query",
      "SELECT school, region, district, COUNT(*) AS student_count, ROUND(AVG(rating)) AS avg_rating FROM users WHERE school IS NOT NULL AND school != '' GROUP BY school, region, district ORDER BY student_count DESC LIMIT $1 OFFSET $2",
      [25, 0],
    ],
  ]);
  assert.deepEqual(response.body, {
    schools: [
      {
        name: "12-maktab",
        studentCount: 15,
        avgRating: 1420,
        region: "Toshkent",
        district: "Chilonzor",
      },
      {
        name: "5-maktab",
        studentCount: 3,
        avgRating: 0,
        region: "—",
        district: "—",
      },
    ],
    pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
  });
});

test("admin school list preserves search, region, and parameter order", async () => {
  const harness = createHarness({ total: "75", rows: [] });
  const response = createResponse();

  await harness.controller.list(
    {
      query: {
        page: "3",
        limit: "20",
        search: "  MAKTAB  ",
        region: "  Toshkent  ",
      },
    },
    response
  );

  assert.deepEqual(harness.calls, [
    [
      "query",
      "SELECT COUNT(*) AS total FROM (SELECT school, region, district FROM users WHERE school IS NOT NULL AND school != '' AND LOWER(school) LIKE $1 AND region = $2 GROUP BY school, region, district) AS sub",
      ["%maktab%", "Toshkent"],
    ],
    [
      "query",
      "SELECT school, region, district, COUNT(*) AS student_count, ROUND(AVG(rating)) AS avg_rating FROM users WHERE school IS NOT NULL AND school != '' AND LOWER(school) LIKE $1 AND region = $2 GROUP BY school, region, district ORDER BY student_count DESC LIMIT $3 OFFSET $4",
      ["%maktab%", "Toshkent", 20, 40],
    ],
  ]);
  assert.deepEqual(response.body.pagination, {
    page: 3,
    limit: 20,
    total: 75,
    totalPages: 4,
  });
});

test("admin school list preserves pagination boundaries", async () => {
  const harness = createHarness({ total: "0", rows: [] });
  const response = createResponse();

  await harness.controller.list({ query: { page: "-2", limit: "1000" } }, response);

  assert.deepEqual(harness.calls[1][2], [100, 0]);
  assert.deepEqual(response.body.pagination, {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });
});

test("admin school list preserves errors from either query", async () => {
  for (const errorAt of [1, 2]) {
    const harness = createHarness({ errorAt });
    const response = createResponse();

    await harness.controller.list({ query: {} }, response);

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Maktablar xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin school list route preserves path, method, and middleware order", () => {
  const router = createAdminSchoolListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/schools");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
