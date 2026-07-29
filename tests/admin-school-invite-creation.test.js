const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminSchoolInviteCreationController,
} = require("../src/controllers/adminSchoolInviteCreationController");
const adminSchoolInviteCreationRoutes = require("../src/routes/adminSchoolInviteCreationRoutes");

const expectedSql = [
  `SELECT id FROM school_invites
       WHERE school_name = $1 AND region = $2 AND district = $3 AND used_by IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
  `SELECT id FROM users
       WHERE role = 'school_admin' AND region = $1 AND district = $2 AND school = $3`,
  `INSERT INTO school_invites (code_hash, school_name, region, district, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
];

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

function createHarness(results = [[], [], []], options = {}) {
  const calls = [];
  let queryIndex = 0;
  const controller = createAdminSchoolInviteCreationController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        if (options.error) throw options.error;
        return { rows: results[queryIndex++] || [] };
      },
    },
    schoolInvite: {
      generateRawCode() {
        calls.push(["generateRawCode"]);
        return "ABCD-EFGH-IJ";
      },
      hashCode(code) {
        calls.push(["hashCode", code]);
        return "hashed-code";
      },
    },
    normalizeSchool(value) {
      calls.push(["normalizeSchool", value]);
      return "12-maktab";
    },
    schoolIdentityKey(region, district, school) {
      calls.push(["schoolIdentityKey", region, district, school]);
      return options.invalidIdentity ? null : "identity";
    },
    logger: options.logger,
    now: () => 1_700_000_000_000,
  });
  return { calls, controller };
}

test("admin school invite preserves required-field and identity validation", async () => {
  const missing = createHarness();
  const missingResponse = createResponse();
  await missing.controller.create({ body: {}, user: { id: 1 } }, missingResponse);
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Maktab nomi majburiy (kamida 3 harf)" });
  assert.deepEqual(missing.calls, []);

  const invalid = createHarness(undefined, { invalidIdentity: true });
  const invalidResponse = createResponse();
  await invalid.controller.create({
    body: { school_name: "School", region: "Toshkent", district: "Chilonzor" },
    user: { id: 1 },
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Viloyat, tuman va maktab to'liq kiritilishi kerak" });
});

test("admin school invite preserves existing invite and admin responses", async () => {
  const existing = createHarness([[{ id: 1 }]]);
  const existingResponse = createResponse();
  await existing.controller.create({
    body: { school_name: "School", region: " Toshkent ", district: " Chilonzor " },
    user: { id: 1 },
  }, existingResponse);
  assert.equal(existingResponse.statusCode, 400);
  assert.deepEqual(existingResponse.body, { error: "Bu maktab uchun faol kod allaqachon mavjud" });

  const admin = createHarness([[], [{ id: 2 }]]);
  const adminResponse = createResponse();
  await admin.controller.create({
    body: { school_name: "School", region: "Toshkent", district: "Chilonzor" },
    user: { id: 1 },
  }, adminResponse);
  assert.equal(adminResponse.statusCode, 400);
  assert.deepEqual(adminResponse.body, { error: "Bu maktabда allaqachon admin bor" });
});

test("admin school invite preserves SQL, parameters, code creation, and response", async () => {
  const harness = createHarness();
  const response = createResponse();
  await harness.controller.create({
    body: {
      school_name: "School 12",
      region: " Toshkent ",
      district: " Chilonzor ",
      expires_days: 2,
    },
    user: { id: 55 },
  }, response);

  const sqlCalls = harness.calls.filter((call) => expectedSql.includes(call[0]));
  assert.deepEqual(sqlCalls.map((call) => call[0]), expectedSql);
  assert.deepEqual(sqlCalls[0][1], ["12-maktab", "Toshkent", "Chilonzor"]);
  assert.deepEqual(sqlCalls[1][1], ["Toshkent", "Chilonzor", "12-maktab"]);
  assert.deepEqual(sqlCalls[2][1].slice(0, 5), [
    "hashed-code", "12-maktab", "Toshkent", "Chilonzor", 55,
  ]);
  assert.equal(sqlCalls[2][1][5].toISOString(), "2023-11-16T22:13:20.000Z");
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, {
    message: "Kod yaratildi. Maktab rahbariga bering (qayta ko'rsatilmaydi!)",
    code: "ABCD-EFGH-IJ",
    school_name: "12-maktab",
    expires_at: sqlCalls[2][1][5],
  });
});

test("admin school invite preserves default expiry and nullable creator", async () => {
  const harness = createHarness();
  const response = createResponse();
  await harness.controller.create({
    body: { school_name: "School", region: "Toshkent", district: "Chilonzor" },
  }, response);

  const insert = harness.calls.find((call) => call[0] === expectedSql[2]);
  assert.equal(insert[1][4], null);
  assert.equal(insert[1][5].toISOString(), "2023-12-14T22:13:20.000Z");
});

test("admin school invite preserves database error logging and response", async () => {
  const logs = [];
  const harness = createHarness(undefined, {
    error: new Error("database failed"),
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();
  await harness.controller.create({
    body: { school_name: "School", region: "Toshkent", district: "Chilonzor" },
    user: { id: 1 },
  }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["School invite yaratish xatosi:", "database failed"]]);
});

test("admin school invite route preserves path and admin middleware order", () => {
  const router = adminSchoolInviteCreationRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/school-invites");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
