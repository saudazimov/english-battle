const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminInsightsRoutes } = require("../src/routes/adminInsightsRoutes");

test("admin insights preserves phased order and dependencies", () => {
  const calls = [];
  const app = { use(router) { calls.push(["mount", router]); } };
  const pool = {};
  const routes = {
    createAnalytics(dependencies) {
      calls.push(["analytics", dependencies]);
      return "analytics-router";
    },
    registerDashboard(dependencies) {
      calls.push(["dashboard", dependencies]);
    },
  };
  const insights = createAdminInsightsRoutes({ pool, routes });

  insights.registerAnalyticsRoutes(app);
  calls.push(["intermediateRoutes"]);
  insights.registerDashboardRoutes(app);

  assert.deepEqual(calls, [
    ["analytics", { pool }],
    ["mount", "analytics-router"],
    ["intermediateRoutes"],
    ["dashboard", { app, pool }],
  ]);
});
