const test = require("node:test");
const assert = require("node:assert/strict");

const registerStudentTournamentRoutes = require("../src/routes/studentTournamentRoutes");

test("student tournament routes preserve mount order and dependencies", () => {
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
    bracket(dependencies) {
      calls.push(["bracket", dependencies]);
      return "bracket-router";
    },
  };

  registerStudentTournamentRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["list-router", "bracket-router"]);
  assert.deepEqual(calls, [
    ["list", { pool }],
    ["bracket", { pool }],
  ]);
});
