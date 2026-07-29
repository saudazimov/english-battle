const test = require("node:test");
const assert = require("node:assert/strict");

const registerTeacherAssignmentManagementRoutes = require("../src/routes/teacherAssignmentManagementRoutes");

test("teacher assignment management routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const routeFactories = {
    classList(dependencies) {
      calls.push(["classList", dependencies]);
      return "class-list-router";
    },
    archive(dependencies) {
      calls.push(["archive", dependencies]);
      return "archive-router";
    },
    results(dependencies) {
      calls.push(["results", dependencies]);
      return "results-router";
    },
  };

  registerTeacherAssignmentManagementRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, [
    "class-list-router",
    "archive-router",
    "results-router",
  ]);
  assert.deepEqual(calls, [
    ["classList", { pool }],
    ["archive", { pool }],
    ["results", { pool }],
  ]);
});
