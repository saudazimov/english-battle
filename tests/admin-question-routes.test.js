const test = require("node:test");
const assert = require("node:assert/strict");

const adminQuestionRoutes = require("../src/routes/adminQuestionRoutes");

test("admin question routes preserve phased dependencies and bulk mount", () => {
  const calls = [];
  const app = {
    use(router) {
      calls.push(["mount", router]);
    },
  };
  const pool = {};
  const logAudit = () => {};
  const routes = {
    registerManagement(dependencies) {
      calls.push(["management", dependencies]);
    },
    registerMonitoring(dependencies) {
      calls.push(["monitoring", dependencies]);
    },
    createBulkImport(dependencies) {
      calls.push(["bulk-import", dependencies]);
      return "bulk-import-router";
    },
  };

  adminQuestionRoutes.registerManagementRoutes({ app, pool, logAudit, routes });
  adminQuestionRoutes.registerMonitoringRoutes({ app, pool, routes });
  adminQuestionRoutes.registerBulkImportRoutes({ app, pool, logAudit, routes });

  assert.deepEqual(calls, [
    ["management", { app, pool, logAudit }],
    ["monitoring", { app, pool }],
    ["bulk-import", { pool, logAudit }],
    ["mount", "bulk-import-router"],
  ]);
});
