const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminTournamentDistrictSchoolsController,
} = require("../src/controllers/adminTournamentDistrictSchoolsController");
const createAdminTournamentDistrictSchoolsRoutes = require("../src/routes/adminTournamentDistrictSchoolsRoutes");

const SCHOOLS_SQL = `SELECT school,
                  COUNT(*) AS student_count,
                  ROUND(AVG(rating)) AS avg_rating
           FROM users
           WHERE region = $1 AND district = $2
             AND school IS NOT NULL AND school <> ''
             AND (role = 'student' OR role IS NULL)
           GROUP BY school
           ORDER BY avg_rating DESC, student_count DESC`;

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

test("district schools preserves required query validation", async () => {
  const controller = createAdminTournamentDistrictSchoolsController({ pool: {} });
  for (const query of [{}, { region: "Toshkent" }, { district: "Bektemir" }]) {
    const response = createResponse();
    const result = await controller.list({ query }, response);
    assert.equal(result, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Viloyat va tuman kerak" });
  }
});

test("district schools preserves trimmed parameters, query, and mapped response", async () => {
  const calls = [];
  const controller = createAdminTournamentDistrictSchoolsController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return {
          rows: [
            { school: "1-maktab", student_count: "25", avg_rating: "1140" },
            { school: "2-maktab", student_count: "7", avg_rating: "0" },
          ],
        };
      },
    },
  });
  const response = createResponse();

  assert.equal(await controller.list({
    query: { region: "  Toshkent  ", district: " Bektemir " },
  }, response), undefined);

  assert.deepEqual(calls, [[SCHOOLS_SQL, ["Toshkent", "Bektemir"]]]);
  assert.deepEqual(response.body, {
    region: "Toshkent",
    district: "Bektemir",
    school_count: 2,
    schools: [
      { school: "1-maktab", student_count: 25, avg_rating: 1140 },
      { school: "2-maktab", student_count: 7, avg_rating: 1000 },
    ],
  });
});

test("district schools preserves safe database-error response", async () => {
  const logs = [];
  const controller = createAdminTournamentDistrictSchoolsController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  assert.equal(await controller.list({
    query: { region: "Toshkent", district: "Bektemir" },
  }, response), undefined);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Tumandagi maktablar xatosi:", "database unavailable"]]);
});

test("district schools route preserves path, method, and middleware order", () => {
  const router = createAdminTournamentDistrictSchoolsRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/tournaments/schools-in-district");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
