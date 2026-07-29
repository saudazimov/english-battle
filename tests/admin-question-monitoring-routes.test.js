const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminQuestionMonitoringRoutes = require(
  "../src/routes/adminQuestionMonitoringRoutes"
);

test("admin question monitoring registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    stats: factory("stats"),
    health: factory("health"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminQuestionMonitoringRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["stats-router", "health-router"]);
  assert.deepEqual(calls, [
    ["stats", { pool }],
    ["health", { pool }],
  ]);
});
