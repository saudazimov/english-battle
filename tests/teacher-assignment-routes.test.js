const test = require("node:test");
const assert = require("node:assert/strict");

const teacherAssignmentRoutes = require("../src/routes/teacherAssignmentRoutes");

test("teacher assignment routes preserve phased dependencies and create mount", () => {
  const calls = [];
  const app = {
    use(router) {
      calls.push(["mount", router]);
    },
  };
  const pool = {};
  const premium = {};
  const logAudit = () => {};
  const sanitizeText = () => {};
  const routes = {
    registerOverview(dependencies) {
      calls.push(["overview", dependencies]);
    },
    createAssignment(dependencies) {
      calls.push(["create", dependencies]);
      return "create-assignment-router";
    },
    registerManagement(dependencies) {
      calls.push(["management", dependencies]);
    },
  };

  teacherAssignmentRoutes.registerOverviewRoutes({ app, pool, routes });
  teacherAssignmentRoutes.registerCreateRoutes({
    app,
    pool,
    premium,
    logAudit,
    sanitizeText,
    routes,
  });
  teacherAssignmentRoutes.registerManagementRoutes({ app, pool, routes });

  assert.deepEqual(calls, [
    ["overview", { app, pool }],
    ["create", { pool, premium, logAudit, sanitizeText }],
    ["mount", "create-assignment-router"],
    ["management", { app, pool }],
  ]);
});
