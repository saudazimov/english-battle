const test = require("node:test");
const assert = require("node:assert/strict");
const { createSchoolOverviewController } = require("../src/controllers/schoolOverviewController");

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

test("school overview preserves school-admin rejection", async () => {
  let queryCount = 0;
  const controller = createSchoolOverviewController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async getSchoolAdmin() { return { ok: false, error: "Faqat maktab admini uchun" }; },
  });
  const res = createResponse();

  await controller.getOverview({ user: { id: 42 } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Faqat maktab admini uchun" });
});

test("school overview preserves all queries, numeric parsing and response", async () => {
  const queries = [];
  const topStudents = [{ id: 7, first_name: "Ali", rating: 1400 }];
  const admin = {
    first_name: "Admin",
    last_name: "User",
    school: "School",
    district: "D",
    region: "R",
  };
  const controller = createSchoolOverviewController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (queries.length === 1) {
          return { rows: [{ total: "12", avg_rating: "1111", top_rating: "1400" }] };
        }
        if (queries.length === 2) return { rows: topStudents };
        return { rows: [{ c: "3" }] };
      },
    },
    async getSchoolAdmin(userId) {
      assert.equal(userId, 42);
      return { ok: true, user: admin };
    },
  });
  const res = createResponse();

  await controller.getOverview({ user: { id: 42 } }, res);

  assert.equal(queries.length, 3);
  assert.equal(
    queries[0].sql,
    `SELECT COUNT(*) AS total,
              ROUND(AVG(rating)) AS avg_rating,
              MAX(rating) AS top_rating
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)`
  );
  assert.deepEqual(queries[0].params, ["R", "D", "School"]);
  assert.equal(
    queries[1].sql,
    `SELECT id, first_name, last_name, rating, cefr_level, profile_picture
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)
       ORDER BY rating DESC LIMIT 5`
  );
  assert.deepEqual(queries[1].params, ["R", "D", "School"]);
  assert.equal(
    queries[2].sql,
    `SELECT COUNT(*) AS c FROM tournaments t
       WHERE t.status IN ('registration','bracket','live')
         AND (
           (t.level = 'district' AND t.scope_value = $1 AND t.region = $2)
           OR (t.level = 'region' AND t.scope_value = $2)
           OR (t.level = 'country')
         )`
  );
  assert.deepEqual(queries[2].params, ["D", "R"]);
  assert.deepEqual(res.body, {
    admin: { first_name: "Admin", last_name: "User" },
    school: "School",
    region: "R",
    district: "D",
    stats: {
      total_students: 12,
      avg_rating: 1111,
      top_rating: 1400,
      active_tournaments: 3,
    },
    top_students: topStudents,
  });
});

test("school overview preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createSchoolOverviewController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async getSchoolAdmin() {
      return { ok: true, user: { school: "S", district: "D", region: "R" } };
    },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.getOverview({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["School overview xatosi:", "database unavailable"]]);
});
