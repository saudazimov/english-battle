const test = require("node:test");
const assert = require("node:assert/strict");
const registerSchoolDashboardRoutes = require(
  "../src/routes/schoolDashboardRoutes"
);

test("school dashboard registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const getSchoolAdmin = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    profile: factory("profile"),
    overview: factory("overview"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerSchoolDashboardRoutes({
    app,
    pool,
    getSchoolAdmin,
    routeFactories,
  });

  assert.deepEqual(mounted, ["profile-router", "overview-router"]);
  assert.deepEqual(calls, [
    ["profile", { pool, getSchoolAdmin }],
    ["overview", { getSchoolAdmin }],
  ]);
});
