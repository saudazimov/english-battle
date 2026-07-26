const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSchoolTournamentTeamSaveController,
} = require("../src/controllers/schoolTournamentTeamSaveController");

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

function createClient(query) {
  return {
    releaseCount: 0,
    query,
    release() {
      this.releaseCount += 1;
    },
  };
}

test("school tournament team save preserves school-admin rejection and client release", async () => {
  let queryCount = 0;
  const client = createClient(async () => { queryCount += 1; return { rows: [] }; });
  const controller = createSchoolTournamentTeamSaveController({
    pool: { async connect() { return client; } },
    async getSchoolAdmin() { return { ok: false, error: "Faqat maktab admini uchun" }; },
  });
  const res = createResponse();

  await controller.save({ user: { id: 42 }, params: { id: "9" }, body: {} }, res);

  assert.equal(queryCount, 0);
  assert.equal(client.releaseCount, 1);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Faqat maktab admini uchun" });
});

test("school tournament team save preserves tournament-not-found response", async () => {
  const queries = [];
  const client = createClient(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  });
  const controller = createSchoolTournamentTeamSaveController({
    pool: { async connect() { return client; } },
    async getSchoolAdmin() { return { ok: true, user: {} }; },
  });
  const res = createResponse();

  await controller.save({ user: { id: 42 }, params: { id: "9" }, body: {} }, res);

  assert.deepEqual(queries, [{ sql: "SELECT * FROM tournaments WHERE id = $1", params: ["9"] }]);
  assert.equal(client.releaseCount, 1);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Turnir topilmadi" });
});

test("school tournament team save preserves validation before transaction", async () => {
  const client = createClient(async () => ({
    rows: [{ status: "registration", registration_deadline: null, team_size: 2, reserve_size: 1 }],
  }));
  const controller = createSchoolTournamentTeamSaveController({
    pool: { async connect() { return client; } },
    async getSchoolAdmin() { return { ok: true, user: {} }; },
  });
  const res = createResponse();

  await controller.save({
    user: { id: 42 }, params: { id: "9" }, body: { starters: [11], reserves: [] },
  }, res);

  assert.equal(client.releaseCount, 1);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Asosiy o'yinchilar soni 2 ta bo'lishi kerak (hozir: 1)" });
});

test("school tournament team save preserves transaction SQL order and response", async () => {
  const tournament = {
    status: "registration", registration_deadline: null, team_size: 2, reserve_size: 1,
  };
  const queries = [];
  const client = createClient(async (sql, params) => {
    queries.push({ sql, params });
    if (sql === "SELECT * FROM tournaments WHERE id = $1") return { rows: [tournament] };
    if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: 11 }, { id: 12 }, { id: 13 }] };
    if (sql.startsWith("SELECT ROUND(AVG(rating))")) return { rows: [{ avg: "1250" }] };
    return { rows: [] };
  });
  const admin = {
    school: "1-maktab", school_key: "r|d|s", region: "R", district: "D",
  };
  const controller = createSchoolTournamentTeamSaveController({
    pool: { async connect() { return client; } },
    async getSchoolAdmin(userId) {
      assert.equal(userId, 42);
      return { ok: true, user: admin };
    },
  });
  const res = createResponse();

  await controller.save({
    user: { id: 42 }, params: { id: "9" }, body: { starters: [11, 12], reserves: [13] },
  }, res);

  assert.deepEqual(queries, [
    { sql: "SELECT * FROM tournaments WHERE id = $1", params: ["9"] },
    {
      sql: `SELECT id FROM users
       WHERE id = ANY($1) AND region = $2 AND district = $3 AND school = $4
         AND (role = 'student' OR role IS NULL)`,
      params: [[11, 12, 13], "R", "D", "1-maktab"],
    },
    { sql: "BEGIN", params: undefined },
    {
      sql: "DELETE FROM tournament_team_members WHERE tournament_id = $1 AND school_key = $2",
      params: ["9", "r|d|s"],
    },
    {
      sql: "INSERT INTO tournament_team_members (tournament_id, school, school_key, user_id, member_role, slot_order) VALUES ($1, $2, $3, $4, 'starter', $5)",
      params: ["9", "1-maktab", "r|d|s", 11, 1],
    },
    {
      sql: "INSERT INTO tournament_team_members (tournament_id, school, school_key, user_id, member_role, slot_order) VALUES ($1, $2, $3, $4, 'starter', $5)",
      params: ["9", "1-maktab", "r|d|s", 12, 2],
    },
    {
      sql: "INSERT INTO tournament_team_members (tournament_id, school, school_key, user_id, member_role, slot_order) VALUES ($1, $2, $3, $4, 'reserve', $5)",
      params: ["9", "1-maktab", "r|d|s", 13, 1],
    },
    {
      sql: "SELECT ROUND(AVG(rating)) AS avg FROM users WHERE id = ANY($1)",
      params: [[11, 12]],
    },
    {
      sql: `INSERT INTO tournament_schools (tournament_id, school, region, district, school_key, avg_rating)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, school_key)
       DO UPDATE SET school = EXCLUDED.school, region = EXCLUDED.region,
                     district = EXCLUDED.district, avg_rating = EXCLUDED.avg_rating`,
      params: ["9", "1-maktab", "R", "D", "r|d|s", 1250],
    },
    { sql: "COMMIT", params: undefined },
  ]);
  assert.equal(client.releaseCount, 1);
  assert.deepEqual(res.body, { success: true, starters: 2, reserves: 1 });
});

test("school tournament team save preserves rollback and error response", async () => {
  const queries = [];
  const client = createClient(async (sql) => {
    queries.push(sql);
    if (sql !== "ROLLBACK") throw new Error("database unavailable");
    return { rows: [] };
  });
  const logged = [];
  const controller = createSchoolTournamentTeamSaveController({
    pool: { async connect() { return client; } },
    async getSchoolAdmin() { return { ok: true, user: {} }; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.save({ user: { id: 42 }, params: { id: "9" }, body: {} }, res);

  assert.deepEqual(queries, ["SELECT * FROM tournaments WHERE id = $1", "ROLLBACK"]);
  assert.equal(client.releaseCount, 1);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi: database unavailable" });
  assert.deepEqual(logged, [["Jamoa saqlash xatosi:", "database unavailable"]]);
});

test("school tournament team save preserves pool connection failure propagation", async () => {
  const controller = createSchoolTournamentTeamSaveController({
    pool: { async connect() { throw new Error("connection failed"); } },
    async getSchoolAdmin() { throw new Error("must not run"); },
  });

  await assert.rejects(
    controller.save({ user: { id: 42 }, params: { id: "9" }, body: {} }, createResponse()),
    /connection failed/
  );
});
