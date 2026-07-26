const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSchoolTournamentTeamListController,
} = require("../src/controllers/schoolTournamentTeamListController");

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

test("school tournament team list preserves school-admin rejection", async () => {
  let queryCount = 0;
  const controller = createSchoolTournamentTeamListController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async getSchoolAdmin() { return { ok: false, error: "Faqat maktab admini uchun" }; },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { id: "99" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Faqat maktab admini uchun" });
});

test("school tournament team list preserves query parameters and response", async () => {
  const rows = [{ user_id: 7, member_role: "starter", slot_order: 1 }];
  const queries = [];
  const adminCalls = [];
  const controller = createSchoolTournamentTeamListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows };
      },
    },
    async getSchoolAdmin(userId) {
      adminCalls.push(userId);
      return { ok: true, user: { school_key: "R\u001fD\u001fS" } };
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { id: "99" } }, res);

  assert.deepEqual(adminCalls, [42]);
  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT tm.user_id, tm.member_role, tm.slot_order,
              u.first_name, u.last_name, u.rating, u.cefr_level, u.profile_picture
       FROM tournament_team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tournament_id = $1 AND tm.school_key = $2
       ORDER BY tm.member_role DESC, tm.slot_order ASC`
  );
  assert.deepEqual(queries[0].params, ["99", "R\u001fD\u001fS"]);
  assert.deepEqual(res.body, { team: rows });
});

test("school tournament team list preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createSchoolTournamentTeamListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async getSchoolAdmin() { return { ok: true, user: { school_key: "key" } }; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { id: "99" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Jamoa olish xatosi:", "database unavailable"]]);
});
