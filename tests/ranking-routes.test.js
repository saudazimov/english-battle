const test = require("node:test");
const assert = require("node:assert/strict");
const registerRankingRoutes = require("../src/routes/rankingRoutes");

test("ranking registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const currentSeason = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    schoolBattle: factory("school-battle"),
    combined: factory("combined"),
    leaderboard: factory("leaderboard"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerRankingRoutes({ app, pool, currentSeason, routeFactories });

  assert.deepEqual(mounted, [
    "school-battle-router",
    "combined-router",
    "leaderboard-router",
  ]);
  assert.deepEqual(calls, [
    ["school-battle", { pool, currentSeason }],
    ["combined", { pool, currentSeason }],
    ["leaderboard", { pool }],
  ]);
});
