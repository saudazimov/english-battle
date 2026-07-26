const test = require("node:test");
const assert = require("node:assert/strict");
const { createSchoolTournamentsController } = require("../src/controllers/schoolTournamentsController");

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

test("school tournaments preserves school-admin rejection", async () => {
  let queryCount = 0;
  const controller = createSchoolTournamentsController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async getSchoolAdmin() { return { ok: false, error: "Faqat maktab admini uchun" }; },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Faqat maktab admini uchun" });
});

test("school tournaments preserves query parameters and response", async () => {
  const rows = [{ id: 9, name: "District Cup", my_team_count: "5" }];
  const queries = [];
  const admin = {
    school: "School",
    school_key: "R\u001fD\u001fSchool",
    district: "D",
    region: "R",
  };
  const controller = createSchoolTournamentsController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows };
      },
    },
    async getSchoolAdmin(userId) {
      assert.equal(userId, 42);
      return { ok: true, user: admin };
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT t.*,
              (SELECT COUNT(*) FROM tournament_team_members tm
               WHERE tm.tournament_id = t.id AND tm.school_key = $1) AS my_team_count
       FROM tournaments t
       WHERE t.status IN ('registration','bracket','live','finished')
         AND (
           (t.level = 'district' AND t.scope_value = $2 AND t.region = $3)
           OR (t.level = 'region' AND t.scope_value = $3)
           OR (t.level = 'country')
         )
       ORDER BY t.created_at DESC`
  );
  assert.deepEqual(queries[0].params, [admin.school_key, "D", "R"]);
  assert.deepEqual(res.body, {
    school: "School",
    region: "R",
    district: "D",
    tournaments: rows,
  });
});

test("school tournaments preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createSchoolTournamentsController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async getSchoolAdmin() {
      return { ok: true, user: { school_key: "key", district: "D", region: "R" } };
    },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["School turnirlar xatosi:", "database unavailable"]]);
});
