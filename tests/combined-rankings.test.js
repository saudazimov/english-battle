const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const { createCombinedRankingsService } = require("../src/services/combinedRankingsService");
const { createCombinedRankingsController } = require("../src/controllers/combinedRankingsController");
const combinedRankingsRoutes = require("../src/routes/combinedRankingsRoutes");

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
    pool: { async query(sql, params) { calls.push([sql, params]); return results[index++]; } },
  };
}

test("combined rankings preserve default season scoring and mapping", async () => {
  const harness = createPool([
    { rows: [{ country: "UZ", region: "R", district: "D", school: "S" }] },
    { rows: [
      { region: "R", district: "D", school: "S", avg_rating: 1400, player_count: 10 },
      { region: "X", district: "Y", school: "Z", avg_rating: 1200, player_count: 5 },
    ] },
    { rows: [
      { region: "R", district: "D", school: "S", effort_points: 1500, active_students: 8 },
      { region: "X", district: "Y", school: "Z", effort_points: 100, active_students: 2 },
    ] },
  ]);
  const seasons = ["season-query", "season-response"];
  const service = createCombinedRankingsService({
    pool: harness.pool,
    currentSeason: () => seasons.shift(),
  });

  const result = await service.getRankings(7, {});

  assert.deepEqual(harness.calls[0], [
    "SELECT country, region, district, school FROM users WHERE id = $1", [7],
  ]);
  assert.match(harness.calls[1][0], /SELECT region, district, school, ROUND\(AVG\(rating\)\)/);
  assert.match(harness.calls[1][0], /AND country = \$1/);
  assert.deepEqual(harness.calls[1][1], ["UZ"]);
  assert.match(harness.calls[2][0], /season = \$1/);
  assert.match(harness.calls[2][0], /point_user\.country = \$2/);
  assert.deepEqual(harness.calls[2][1], ["season-query", "UZ"]);
  assert.equal(result.scope, "schools");
  assert.equal(result.period, "season");
  assert.equal(result.within, "country");
  assert.equal(result.season, "season-response");
  assert.equal(result.count, 2);
  assert.equal(result.rankings[0].school, "S");
  assert.equal(result.rankings[0].fame_score, 750);
  assert.equal(result.rankings[0].effort_score, 750);
  assert.equal(result.rankings[0].school_rating, 1500);
  assert.equal(result.rankings[0].rank, 1);
  assert.equal(result.rankings[0].is_mine, true);
  assert.equal(result.my_entry, result.rankings[0]);
});

test("combined rankings preserve district coercion and filters", async () => {
  const harness = createPool([
    { rows: [{ country: "UZ", region: "R", district: "D", school: "S" }] },
    { rows: [{ region: "R", district: "D", avg_rating: 1000, player_count: 2 }] },
    { rows: [] },
  ]);
  const service = createCombinedRankingsService({ pool: harness.pool, currentSeason: () => "season" });

  const result = await service.getRankings(7, {
    scope: "districts", period: "week", within: "district",
  });

  assert.equal(result.within, "region");
  assert.match(harness.calls[1][0], /SELECT region, district,/);
  assert.match(harness.calls[1][0], /AND country = \$1 AND region = \$2/);
  assert.deepEqual(harness.calls[1][1], ["UZ", "R"]);
  assert.match(harness.calls[2][0], /point_user\.country = \$1\).*region = \$2/);
  assert.deepEqual(harness.calls[2][1], ["UZ", "R"]);
  assert.equal(result.rankings[0].effort_points, 0);
  assert.equal(result.rankings[0].active_students, 0);
  assert.equal(result.rankings[0].is_mine, true);
});

test("combined rankings preserve regions country-only behavior", async () => {
  const harness = createPool([
    { rows: [{ country: "UZ", region: "R", district: "D" }] },
    { rows: [] },
    { rows: [] },
  ]);
  const service = createCombinedRankingsService({ pool: harness.pool, currentSeason: () => "season" });

  const result = await service.getRankings(7, {
    scope: "regions", period: "all", within: "district",
  });

  assert.equal(result.within, "country");
  assert.deepEqual(harness.calls[1][1], ["UZ"]);
  assert.deepEqual(harness.calls[2][1], ["UZ"]);
  assert.match(harness.calls[1][0], /SELECT region,/);
  assert.match(harness.calls[1][0], /AND country = \$1/);
  assert.match(harness.calls[2][0], /point_user\.country = \$1/);
});

test("combined rankings preserves database error response", async () => {
  const logs = [];
  const controller = createCombinedRankingsController({
    pool: { async query() { throw new Error("database failed"); } },
    currentSeason: () => "season",
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  await controller.rankings({ user: { id: 7 }, query: {} }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Combined rankings xato:", "database failed"]]);
});

test("combined rankings route preserves authentication order", () => {
  const router = combinedRankingsRoutes({ pool: {}, currentSeason: () => "season" });
  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/rankings/combined");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
