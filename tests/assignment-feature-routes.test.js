const test = require("node:test");
const assert = require("node:assert/strict");

const assignmentFeatureRoutes = require("../src/routes/assignmentFeatureRoutes");

test("assignment feature preserves teacher-student phased dependencies", () => {
  const calls = [];
  const app = {};
  const pool = {};
  const premium = {};
  const logAudit = () => {};
  const sanitizeText = () => {};
  const routes = {
    registerTeacherOverview(dependencies) {
      calls.push(["teacher-overview", dependencies]);
    },
    registerStudent(dependencies) {
      calls.push(["student", dependencies]);
    },
    registerTeacherCreate(dependencies) {
      calls.push(["teacher-create", dependencies]);
    },
    registerTeacherManagement(dependencies) {
      calls.push(["teacher-management", dependencies]);
    },
  };

  assignmentFeatureRoutes.registerTeacherOverviewRoutes({ app, pool, routes });
  assignmentFeatureRoutes.registerStudentRoutes({ app, pool, routes });
  assignmentFeatureRoutes.registerTeacherCreateRoutes({
    app,
    pool,
    premium,
    logAudit,
    sanitizeText,
    routes,
  });
  assignmentFeatureRoutes.registerTeacherManagementRoutes({ app, pool, routes });

  assert.deepEqual(calls, [
    ["teacher-overview", { app, pool }],
    ["student", { app, pool }],
    ["teacher-create", { app, pool, premium, logAudit, sanitizeText }],
    ["teacher-management", { app, pool }],
  ]);
});
