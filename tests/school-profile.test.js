const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const { createSchoolProfileService } = require("../src/services/schoolProfileService");
const { createSchoolProfileController } = require("../src/controllers/schoolProfileController");
const schoolProfileRoutes = require("../src/routes/schoolProfileRoutes");

const expectedSql = [
  "SELECT phone, profile_picture, created_at FROM users WHERE id = $1",
  `SELECT COUNT(*) AS total, ROUND(AVG(rating)) AS avg_rating, MAX(rating) AS top_rating
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)`,
  `SELECT
         COUNT(*) FILTER (WHERE status IN ('registration','bracket','live')) AS active,
         COUNT(*) AS total
       FROM tournaments t
       WHERE (
         (t.level = 'district' AND t.scope_value = $1 AND t.region = $2)
         OR (t.level = 'region' AND t.scope_value = $2)
         OR (t.level = 'country')
       )`,
  "SELECT COUNT(DISTINCT tournament_id) AS c FROM tournament_team_members WHERE school_key = $1",
];

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("school profile preserves denied response without queries", async () => {
  let queries = 0;
  const controller = createSchoolProfileController({
    pool: { async query() { queries += 1; } },
    getSchoolAdmin: async () => ({ ok: false, error: "Ruxsat yo'q" }),
  });
  const response = createResponse();

  await controller.profile({ user: { id: 7 } }, response);

  assert.equal(queries, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: "Ruxsat yo'q" });
});

test("school profile preserves SQL order, parameters, and response", async () => {
  const calls = [];
  const admin = {
    id: 7, first_name: "Ali", last_name: "Valiyev",
    region: "Toshkent", district: "Chilonzor", school: "1-maktab",
    school_key: "Toshkent\u001fChilonzor\u001f1-maktab",
  };
  const results = [
    { rows: [{ phone: "+998901234567", profile_picture: "/avatar.png", created_at: "2026-01-01" }] },
    { rows: [{ total: "25", avg_rating: "1134", top_rating: "1600" }] },
    { rows: [{ active: "2", total: "8" }] },
    { rows: [{ c: "3" }] },
  ];
  let index = 0;
  const service = createSchoolProfileService({
    pool: { async query(sql, params) { calls.push([sql, params]); return results[index++]; } },
    getSchoolAdmin: async (userId) => {
      assert.equal(userId, 7);
      return { ok: true, user: admin };
    },
  });

  const result = await service.getProfile(7);

  assert.deepEqual(calls.map((call) => call[0]), expectedSql);
  assert.deepEqual(calls.map((call) => call[1]), [
    [7],
    ["Toshkent", "Chilonzor", "1-maktab"],
    ["Chilonzor", "Toshkent"],
    ["Toshkent\u001fChilonzor\u001f1-maktab"],
  ]);
  assert.deepEqual(result, {
    ok: true,
    profile: {
      admin: {
        first_name: "Ali", last_name: "Valiyev", phone: "+998901234567",
        profile_picture: "/avatar.png", created_at: "2026-01-01",
      },
      school: "1-maktab", region: "Toshkent", district: "Chilonzor",
      school_stats: { total_students: 25, avg_rating: 1134, top_rating: 1600 },
      management: { active_tournaments: 2, total_tournaments: 8, teams_built: 3 },
    },
  });
});

test("school profile preserves nullable and numeric fallbacks", async () => {
  const results = [
    { rows: [] },
    { rows: [{ total: "0", avg_rating: null, top_rating: null }] },
    { rows: [{ active: "0", total: "0" }] },
    { rows: [{ c: "0" }] },
  ];
  let index = 0;
  const service = createSchoolProfileService({
    pool: { async query() { return results[index++]; } },
    getSchoolAdmin: async () => ({
      ok: true,
      user: { id: 7, first_name: "Ali", last_name: "V", region: "R", district: "D", school: "S", school_key: "K" },
    }),
  });

  const result = await service.getProfile(7);

  assert.deepEqual(result.profile.admin, {
    first_name: "Ali", last_name: "V", phone: null, profile_picture: null, created_at: null,
  });
  assert.deepEqual(result.profile.school_stats, {
    total_students: 0, avg_rating: 0, top_rating: 0,
  });
  assert.deepEqual(result.profile.management, {
    active_tournaments: 0, total_tournaments: 0, teams_built: 0,
  });
});

test("school profile preserves database error logging and response", async () => {
  const logs = [];
  const controller = createSchoolProfileController({
    pool: { async query() { throw new Error("database failed"); } },
    getSchoolAdmin: async () => ({ ok: true, user: { id: 7 } }),
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  await controller.profile({ user: { id: 7 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["School profile xatosi:", "database failed"]]);
});

test("school profile route preserves path and authentication order", () => {
  const router = schoolProfileRoutes({ pool: {}, getSchoolAdmin: async () => ({}) });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/school/profile");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
