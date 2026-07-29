const test = require("node:test");
const assert = require("node:assert/strict");

const registerAdminDashboardRoutes = require("../src/routes/adminDashboardRoutes");

test("admin dashboard routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const routeFactories = {
    auditLogs(dependencies) {
      calls.push(["auditLogs", dependencies]);
      return "audit-logs-router";
    },
    overview(dependencies) {
      calls.push(["overview", dependencies]);
      return "overview-router";
    },
  };

  registerAdminDashboardRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["audit-logs-router", "overview-router"]);
  assert.deepEqual(calls, [
    ["auditLogs", { pool }],
    ["overview", { pool }],
  ]);
});
