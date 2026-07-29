const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createSchoolBattleRankingsService,
} = require("../src/services/schoolBattleRankingsService");
const {
  createSchoolBattleRankingsController,
} = require("../src/controllers/schoolBattleRankingsController");
const schoolBattleRankingsRoutes = require("../src/routes/schoolBattleRankingsRoutes");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createPool(results) {
  const calls = [];
  let index = 0;
  return {
    calls,
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return results[index++];
      },
    },
  };
}

test("school battle rankings preserve default queries and mapping", async () => {
  const me = { region: "Toshkent", district: "Chilonzor", school: "1-maktab" };
  const row = {
    rank: "2", region: "Toshkent", district: "Chilonzor", school: "1-maktab",
    total_points: 101, active_students: 4, total_schools: "9",
  };
  const harness = createPool([
    { rows: [me] },
    { rows: [row] },
    { rows: [row] },
  ]);
  const service = createSchoolBattleRankingsService({
    pool: harness.pool,
    currentSeason: () => "2026-S3",
  });

  const result = await service.getRankings(7, {});

  assert.deepEqual(harness.calls[0], [
    "SELECT region, district, school FROM users WHERE id = $1",
    [7],
  ]);
  assert.match(harness.calls[1][0], /WITH ranked AS/);
  assert.match(harness.calls[1][0], /LIMIT 50 OFFSET 0$/);
  assert.deepEqual(harness.calls[1][1], []);
  assert.match(harness.calls[2][0], /WHERE region = \$1 AND district = \$2 AND school = \$3$/);
  assert.deepEqual(harness.calls[2][1], ["Toshkent", "Chilonzor", "1-maktab"]);
  assert.deepEqual(result, {
    scope: "national",
    period: "all",
    page: 1,
    pageSize: 50,
    total_schools: 9,
    schools: [{
      rank: 2, region: "Toshkent", district: "Chilonzor", school: "1-maktab",
      total_points: 101, active_students: 4, avg_points: 25, is_mine: true,
    }],
    my_school: {
      rank: 2, region: "Toshkent", district: "Chilonzor", school: "1-maktab",
      total_points: 101, active_students: 4, avg_points: 25, is_mine: true,
    },
  });
});

test("school battle rankings preserve season, district, and pagination filters", async () => {
  const harness = createPool([
    { rows: [{ region: "Samarqand", district: "Urgut", school: null }] },
    { rows: [] },
  ]);
  const service = createSchoolBattleRankingsService({
    pool: harness.pool,
    currentSeason: () => "2026-S3",
  });

  const result = await service.getRankings(8, {
    scope: "district",
    period: "season",
    page: "2",
  });

  assert.match(
    harness.calls[1][0],
    /WHERE season = \$1 AND region = \$2 AND district = \$3/
  );
  assert.match(harness.calls[1][0], /LIMIT 50 OFFSET 50$/);
  assert.deepEqual(harness.calls[1][1], ["2026-S3", "Samarqand", "Urgut"]);
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(result, {
    scope: "district", period: "season", page: 2, pageSize: 50,
    total_schools: 0, schools: [], my_school: null,
  });
});

test("school battle my preserves no-school early response", async () => {
  const harness = createPool([{ rows: [{ region: "Toshkent", school: null }] }]);
  const service = createSchoolBattleRankingsService({
    pool: harness.pool,
    currentSeason: () => "2026-S3",
  });

  assert.deepEqual(await service.getMySchool(7), { has_school: false });
  assert.equal(harness.calls.length, 1);
});

test("school battle my preserves query order, parameters, and response", async () => {
  const me = { region: "Toshkent", district: "Chilonzor", school: "1-maktab" };
  const harness = createPool([
    { rows: [me] },
    { rows: [{ total_points: 120, active_students: 6 }] },
    { rows: [{ sp: 45 }] },
    { rows: [{ rank: "5" }] },
    { rows: [{ rank: "2" }] },
    { rows: [{ rank: "1" }] },
    { rows: [{ c: "100" }] },
    { rows: [{ c: "20" }] },
    { rows: [{ c: "4" }] },
    { rows: [{ my_points: 30 }] },
    { rows: [{ rank: "3" }] },
  ]);
  const service = createSchoolBattleRankingsService({
    pool: harness.pool,
    currentSeason: () => "2026-S3",
  });

  const result = await service.getMySchool(7);

  assert.equal(harness.calls.length, 11);
  assert.deepEqual(harness.calls[1][1], ["Toshkent", "Chilonzor", "1-maktab"]);
  assert.deepEqual(harness.calls[2][1], ["Toshkent", "Chilonzor", "1-maktab", "2026-S3"]);
  assert.deepEqual(harness.calls.slice(3, 6).map((call) => call[1]), [
    [120], ["Toshkent", 120], ["Toshkent", "Chilonzor", 120],
  ]);
  assert.deepEqual(harness.calls.slice(6, 9).map((call) => call[1]), [
    [], ["Toshkent"], ["Toshkent", "Chilonzor"],
  ]);
  assert.deepEqual(harness.calls[9][1], [7]);
  assert.deepEqual(harness.calls[10][1], ["Toshkent", "Chilonzor", "1-maktab", 30]);
  assert.deepEqual(result, {
    has_school: true,
    region: "Toshkent", district: "Chilonzor", school: "1-maktab",
    total_points: 120, season_points: 45, active_students: 6,
    rank_national: 5, rank_region: 2, rank_district: 1,
    total_national: 100, total_region: 20, total_district: 4,
    my_contribution: 30, my_rank_in_school: 3,
  });
});

test("school battle rankings controllers preserve separate error responses", async () => {
  const logs = [];
  const controller = createSchoolBattleRankingsController({
    pool: { async query() { throw new Error("database failed"); } },
    currentSeason: () => "2026-S3",
    logger: { error(...args) { logs.push(args); } },
  });
  const rankingsResponse = createResponse();
  await controller.rankings({ user: { id: 7 }, query: {} }, rankingsResponse);
  const myResponse = createResponse();
  await controller.mySchool({ user: { id: 7 } }, myResponse);

  assert.deepEqual(logs, [
    ["School rankings xato:", "database failed"],
    ["School my xato:", "database failed"],
  ]);
  assert.equal(rankingsResponse.statusCode, 500);
  assert.deepEqual(rankingsResponse.body, { error: "Server xatosi" });
  assert.equal(myResponse.statusCode, 500);
  assert.deepEqual(myResponse.body, { error: "Server xatosi" });
});

test("school battle rankings routes preserve paths and auth order", () => {
  const router = schoolBattleRankingsRoutes({ pool: {}, currentSeason: () => "season" });

  assert.equal(router.stack.length, 2);
  assert.deepEqual(router.stack.map((layer) => layer.route.path), [
    "/school-battle/rankings",
    "/school-battle/my",
  ]);
  for (const layer of router.stack) {
    assert.equal(layer.route.methods.get, true);
    assert.equal(layer.route.stack.length, 2);
    assert.equal(layer.route.stack[0].handle, authMiddleware);
  }
});
