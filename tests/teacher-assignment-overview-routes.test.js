const test = require("node:test");
const assert = require("node:assert/strict");

const registerTeacherAssignmentOverviewRoutes = require("../src/routes/teacherAssignmentOverviewRoutes");

test("teacher assignment overview routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const routeFactories = {
    list(dependencies) {
      calls.push(["list", dependencies]);
      return "list-router";
    },
    results(dependencies) {
      calls.push(["results", dependencies]);
      return "results-router";
    },
  };

  registerTeacherAssignmentOverviewRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["list-router", "results-router"]);
  assert.deepEqual(calls, [
    ["list", { pool }],
    ["results", { pool }],
  ]);
});
