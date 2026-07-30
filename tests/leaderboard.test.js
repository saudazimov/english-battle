const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const { createLeaderboardService } = require("../src/services/leaderboardService");
const { createLeaderboardController } = require("../src/controllers/leaderboardController");
const leaderboardRoutes = require("../src/routes/leaderboardRoutes");

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

test("leaderboard preserves default all-time query and mapping", async () => {
  const players = Array.from({ length: 51 }, (_, index) => ({
    id: index + 1, first_name: `U${index + 1}`, last_name: "L", cefr_level: "B1",
    rating: 1500 - index, profile_picture: null, region: "R", district: "D",
    school: "S", village: "V", country: "UZ", wins: "3", total_battles: "4",
  }));
  const harness = createPool([
    { rows: [{ country: "UZ", region: "R", district: "D", school: "S" }] },
    { rows: players },
  ]);
  const service = createLeaderboardService({ pool: harness.pool });

  const result = await service.getLeaderboard(51, {});

  assert.deepEqual(harness.calls[0], [
    "SELECT country, region, district, school FROM users WHERE id = $1", [51],
  ]);
  assert.match(harness.calls[1][0], /LEFT JOIN battle_history/);
  assert.match(harness.calls[1][0], /ORDER BY u\.rating DESC, u\.xp DESC$/);
  assert.deepEqual(harness.calls[1][1], []);
  assert.equal(result.scope, "global");
  assert.equal(result.period, "all");
  assert.equal(result.players.length, 50);
  assert.equal(result.players[0].win_rate, 75);
  assert.equal(result.players[0].rank, 1);
  assert.equal(result.my_rank, 51);
  assert.equal(result.my_entry.id, 51);
  assert.equal(result.my_entry.rank, 51);
  assert.equal(result.total_players, 51);
});

test("leaderboard national scope includes only the current user's country", async () => {
  const harness = createPool([
    { rows: [{ country: "UZ", region: "Toshkent", district: "Chilonzor", school: "1-maktab" }] },
    { rows: [] },
  ]);
  const service = createLeaderboardService({ pool: harness.pool });

  const result = await service.getLeaderboard(7, { scope: "national", period: "all" });

  assert.match(harness.calls[1][0], /WHERE u\.country = \$1/);
  assert.deepEqual(harness.calls[1][1], ["UZ"]);
  assert.equal(result.scope, "national");
});

test("leaderboard preserves friends and period query behavior", async () => {
  const harness = createPool([
    { rows: [{ country: "UZ", region: "R", district: "D", school: "S" }] },
    { rows: [{ fid: 9 }] },
    { rows: [{
      id: 7, first_name: "Ali", last_name: "V", cefr_level: "B2", rating: 1300,
      profile_picture: null, region: "R", district: "D", school: "S", village: null,
      country: "UZ", period_gain: 20, period_wins: 2, period_battles: 3,
    }] },
  ]);
  const service = createLeaderboardService({ pool: harness.pool });

  const result = await service.getLeaderboard(7, { scope: "friends", period: "week" });

  assert.match(harness.calls[1][0], /FROM friendships/);
  assert.deepEqual(harness.calls[1][1], [7]);
  assert.match(harness.calls[2][0], /date_trunc\('week', NOW\(\)\)/);
  assert.match(harness.calls[2][0], /WHERE u\.id = ANY\(\$1\)/);
  assert.deepEqual(harness.calls[2][1], [[9, 7]]);
  assert.equal(result.players[0].period_gain, 20);
  assert.equal(result.players[0].win_rate, 67);
  assert.equal(result.my_rank, 1);
});

test("leaderboard my-ranks preserves missing-user response", async () => {
  const harness = createPool([{ rows: [] }]);
  const service = createLeaderboardService({ pool: harness.pool });

  assert.deepEqual(await service.getMyRanks(7), {});
  assert.equal(harness.calls.length, 1);
});

test("leaderboard my-ranks preserves query order, parameters, and response", async () => {
  const harness = createPool([
    { rows: [{ country: "UZ", region: "R", district: "D", school: "S", rating: 1200 }] },
    { rows: [{ fid: 9 }] },
    { rows: [{ rank: "2" }] },
    { rows: [{ rank: "10" }] },
    { rows: [{ rank: "10" }] },
    { rows: [{ rank: "4" }] },
    { rows: [{ rank: "3" }] },
    { rows: [{ rank: "1" }] },
    { rows: [{ c: "100" }] },
    { rows: [{ c: "20" }] },
    { rows: [{ c: "8" }] },
    { rows: [{ c: "2" }] },
  ]);
  const service = createLeaderboardService({ pool: harness.pool });

  const result = await service.getMyRanks(7);

  assert.equal(harness.calls.length, 12);
  assert.deepEqual(harness.calls[2][1], [1200, [9, 7]]);
  assert.deepEqual(harness.calls.slice(3, 8).map((call) => call[1]), [
    [1200], [1200, "UZ"], [1200, "R"], [1200, "R", "D"], [1200, "R", "D", "S"],
  ]);
  assert.match(harness.calls[4][0], /country = \$2/);
  assert.deepEqual(harness.calls.slice(8).map((call) => call[1]), [
    [], ["R"], ["R", "D"], ["R", "D", "S"],
  ]);
  assert.deepEqual(result, {
    rating: 1200, global: 10, national: 10, region: 4, district: 3, school: 1,
    friends: 2, total_global: 100, total_region: 20, total_district: 8,
    total_school: 2, total_friends: 2,
  });
});

test("leaderboard controllers preserve separate error responses", async () => {
  const logs = [];
  const controller = createLeaderboardController({
    pool: { async query() { throw new Error("database failed"); } },
    logger: { error(...args) { logs.push(args); } },
  });
  const leaderboardResponse = createResponse();
  await controller.leaderboard({ user: { id: 7 }, query: {} }, leaderboardResponse);
  const ranksResponse = createResponse();
  await controller.myRanks({ user: { id: 7 } }, ranksResponse);

  assert.deepEqual(logs, [
    ["Leaderboard xatosi:", "database failed"],
    ["My-ranks xato:", "database failed"],
  ]);
  assert.equal(leaderboardResponse.statusCode, 500);
  assert.deepEqual(leaderboardResponse.body, { error: "Server xatosi" });
  assert.equal(ranksResponse.statusCode, 500);
  assert.deepEqual(ranksResponse.body, { error: "Server xatosi" });
});

test("leaderboard routes preserve paths and authentication order", () => {
  const router = leaderboardRoutes({ pool: {} });

  assert.equal(router.stack.length, 2);
  assert.deepEqual(router.stack.map((layer) => layer.route.path), [
    "/leaderboard", "/leaderboard/my-ranks",
  ]);
  for (const layer of router.stack) {
    assert.equal(layer.route.methods.get, true);
    assert.equal(layer.route.stack.length, 2);
    assert.equal(layer.route.stack[0].handle, authMiddleware);
  }
});
