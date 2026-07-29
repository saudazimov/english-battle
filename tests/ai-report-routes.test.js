const test = require("node:test");
const assert = require("node:assert/strict");

const registerAiReportRoutes = require("../src/routes/aiReportRoutes");

test("AI report routes preserve registration order and dependencies", () => {
  const calls = [];
  const app = { use(router) { calls.push(["mount", router]); } };
  const pool = {};
  const premium = {};
  const aiSnapshot = {};
  const aiService = {};
  const routes = {
    registerParent(dependencies) {
      calls.push(["parent", dependencies]);
    },
    createStudentWeekly(dependencies) {
      calls.push(["student", dependencies]);
      return "student-router";
    },
    registerTeacher(dependencies) {
      calls.push(["teacher", dependencies]);
    },
  };

  registerAiReportRoutes({
    app,
    pool,
    premium,
    aiSnapshot,
    aiService,
    routes,
  });

  const dependencies = { app, pool, premium, aiSnapshot, aiService };
  const studentDependencies = { pool, premium, aiSnapshot, aiService };
  assert.deepEqual(calls, [
    ["parent", dependencies],
    ["student", studentDependencies],
    ["mount", "student-router"],
    ["teacher", dependencies],
  ]);
});
