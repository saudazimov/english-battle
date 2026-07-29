const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherDashboardFeatureRoutes = require(
  "../src/routes/teacherDashboardFeatureRoutes"
);

test("teacher dashboard registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    dashboard: factory("dashboard"),
    overview: factory("overview"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherDashboardFeatureRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["dashboard-router", "overview-router"]);
  assert.deepEqual(calls, [
    ["dashboard", undefined],
    ["overview", { pool }],
  ]);
});
