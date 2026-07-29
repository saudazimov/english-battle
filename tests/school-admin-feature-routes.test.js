const test = require("node:test");
const assert = require("node:assert/strict");

const registerSchoolAdminFeatureRoutes = require(
  "../src/routes/schoolAdminFeatureRoutes"
);

test("school admin feature preserves dashboard-before-tournaments order", () => {
  const calls = [];
  const app = {};
  const pool = {};
  const getSchoolAdmin = () => {};
  const routes = {
    registerDashboard(dependencies) {
      calls.push(["dashboard", dependencies]);
    },
    registerTournamentManagement(dependencies) {
      calls.push(["tournaments", dependencies]);
    },
  };

  registerSchoolAdminFeatureRoutes({
    app,
    pool,
    getSchoolAdmin,
    routes,
  });

  assert.deepEqual(calls, [
    ["dashboard", { app, pool, getSchoolAdmin }],
    ["tournaments", { app, getSchoolAdmin }],
  ]);
});
