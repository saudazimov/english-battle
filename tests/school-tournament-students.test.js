const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSchoolTournamentStudentsController,
} = require("../src/controllers/schoolTournamentStudentsController");

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

test("school tournament students preserves school-admin rejection", async () => {
  let queryCount = 0;
  const controller = createSchoolTournamentStudentsController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async getSchoolAdmin() { return { ok: false, error: "Faqat maktab admini uchun" }; },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { id: "999999" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Faqat maktab admini uchun" });
});

test("school tournament students preserves query, authenticated school and response", async () => {
  const rows = [{ id: 7, first_name: "Ali", rating: 1200 }];
  const queries = [];
  const adminCalls = [];
  const controller = createSchoolTournamentStudentsController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows };
      },
    },
    async getSchoolAdmin(userId) {
      adminCalls.push(userId);
      return {
        ok: true,
        user: { region: "R", district: "D", school: "S" },
      };
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { id: "999999" } }, res);

  assert.deepEqual(adminCalls, [42]);
  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT id, first_name, last_name, rating, cefr_level, profile_picture
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)
       ORDER BY rating DESC, first_name ASC`
  );
  assert.deepEqual(queries[0].params, ["R", "D", "S"]);
  assert.deepEqual(res.body, { students: rows });
});

test("school tournament students preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createSchoolTournamentStudentsController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async getSchoolAdmin() {
      return { ok: true, user: { region: "R", district: "D", school: "S" } };
    },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { id: "999999" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Maktab o'quvchilari xatosi:", "database unavailable"]]);
});
