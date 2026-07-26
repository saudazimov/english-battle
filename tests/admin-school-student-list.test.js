const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminSchoolStudentListController,
} = require("../src/controllers/adminSchoolStudentListController");
const createAdminSchoolStudentListRoutes = require("../src/routes/adminSchoolStudentListRoutes");

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

function createHarness({ rows = [{ id: 1 }], queryError } = {}) {
  const calls = [];
  const controller = createAdminSchoolStudentListController({
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return { rows };
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

test("admin school student list preserves required-school validation", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.list(
    { query: { school: "   " } },
    response
  );

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Maktab nomi kerak" });
  assert.deepEqual(harness.calls, []);
});

test("admin school student list preserves school-only SQL and response", async () => {
  const harness = createHarness({ rows: [{ id: 2 }, { id: 1 }] });
  const response = createResponse();

  await harness.controller.list(
    { query: { school: "  12-maktab  " } },
    response
  );

  assert.deepEqual(harness.calls, [
    [
      "query",
      "SELECT id, first_name, last_name, role, cefr_level, rating, is_banned FROM users WHERE school = $1 ORDER BY rating DESC LIMIT 100",
      ["12-maktab"],
    ],
  ]);
  assert.deepEqual(response.body, {
    school: "12-maktab",
    students: [{ id: 2 }, { id: 1 }],
  });
});

test("admin school student list preserves region and district filters", async () => {
  const harness = createHarness({ rows: [] });
  const response = createResponse();

  await harness.controller.list(
    {
      query: {
        school: "12-maktab",
        region: "  Toshkent  ",
        district: "  Chilonzor  ",
      },
    },
    response
  );

  assert.deepEqual(harness.calls[0], [
    "query",
    "SELECT id, first_name, last_name, role, cefr_level, rating, is_banned FROM users WHERE school = $1 AND region = $2 AND district = $3 ORDER BY rating DESC LIMIT 100",
    ["12-maktab", "Toshkent", "Chilonzor"],
  ]);
});

test("admin school student list preserves em-dash placeholder filtering", async () => {
  const harness = createHarness({ rows: [] });
  const response = createResponse();

  await harness.controller.list(
    { query: { school: "12-maktab", region: "—", district: "—" } },
    response
  );

  assert.deepEqual(harness.calls[0][2], ["12-maktab"]);
  assert.doesNotMatch(harness.calls[0][1], /region =|district =/);
});

test("admin school student list preserves error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.list({ query: { school: "12-maktab" } }, response);

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Maktab o'quvchilari xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin school student list route preserves path, method, and middleware order", () => {
  const router = createAdminSchoolStudentListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/schools/students");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
