const test = require("node:test");
const assert = require("node:assert/strict");

const registerDailyEngagementRoutes = require("../src/routes/dailyEngagementRoutes");

test("daily engagement routes preserve order and dependencies", () => {
  const calls = [];
  const app = { use(router) { calls.push(["mount", router]); } };
  const pool = {};
  const getOrCreateDailyQuests = () => {};
  const routes = {
    createStreak(dependencies) {
      calls.push(["streak", dependencies]);
      return "streak-router";
    },
    registerQuests(dependencies) {
      calls.push(["quests", dependencies]);
    },
  };

  registerDailyEngagementRoutes({
    app,
    pool,
    getOrCreateDailyQuests,
    routes,
  });

  assert.deepEqual(calls, [
    ["streak", { pool }],
    ["mount", "streak-router"],
    ["quests", { app, getOrCreateDailyQuests, pool }],
  ]);
});
