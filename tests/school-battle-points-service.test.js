const test = require("node:test");
const assert = require("node:assert/strict");

const { createSchoolBattlePointsService } = require("../src/services/schoolBattlePointsService");

const USER_SQL = "SELECT region, district, school FROM users WHERE id = $1";
const INSERT_SQL = `INSERT INTO school_battle_points (user_id, region, district, school, points, source, season)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`;

test("school battle points preserves invalid-input early returns", async () => {
  let queryCalls = 0;
  const service = createSchoolBattlePointsService({
    pool: { async query() { queryCalls += 1; } },
    currentSeason() { throw new Error("must not calculate season"); },
    logger: {
      log() { throw new Error("must not log"); },
      error() { throw new Error("must not log error"); },
    },
  });

  assert.equal(await service(null, 10, "ranked_win"), undefined);
  assert.equal(await service(5, 0, "ranked_win"), undefined);
  assert.equal(await service(5, -1, "ranked_win"), undefined);
  assert.equal(queryCalls, 0);
});

test("school battle points preserves missing-school early return", async () => {
  const calls = [];
  const service = createSchoolBattlePointsService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ region: "Toshkent", district: "Chilonzor", school: null }] };
      },
    },
    currentSeason() { throw new Error("must not calculate season"); },
    logger: {
      log() { throw new Error("must not log"); },
      error() { throw new Error("must not log error"); },
    },
  });

  assert.equal(await service(9, 5, "team_draw"), undefined);
  assert.deepEqual(calls, [{ sql: USER_SQL, params: [9] }]);
});

test("school battle points preserves SQL order, season and success log", async () => {
  const calls = [];
  const logs = [];
  let seasonCalls = 0;
  const responses = [
    { rows: [{ region: "Toshkent", district: "Chilonzor", school: "1-maktab" }] },
    { rowCount: 1 },
  ];
  const service = createSchoolBattlePointsService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return responses.shift();
      },
    },
    currentSeason() {
      seasonCalls += 1;
      return "2026-07";
    },
    logger: {
      log(...args) { logs.push(args); },
      error() { throw new Error("must not log error"); },
    },
  });

  const result = await service(44, 12, "ranked_win");

  assert.equal(result, undefined);
  assert.equal(seasonCalls, 1);
  assert.deepEqual(calls, [
    { sql: USER_SQL, params: [44] },
    {
      sql: INSERT_SQL,
      params: [44, "Toshkent", "Chilonzor", "1-maktab", 12, "ranked_win", "2026-07"],
    },
  ]);
  assert.deepEqual(logs, [["School ochko: +12 (ranked_win) -> 1-maktab [user 44]"]]);
});

test("school battle points preserves safe database-error logging", async () => {
  const logs = [];
  const service = createSchoolBattlePointsService({
    pool: { async query() { throw new Error("database unavailable"); } },
    currentSeason() { return "2026-07"; },
    logger: {
      log() { throw new Error("must not log success"); },
      error(...args) { logs.push(args); },
    },
  });

  assert.equal(await service(5, 3, "team_win"), undefined);
  assert.deepEqual(logs, [["School Battle ochko xatosi:", "database unavailable"]]);
});
