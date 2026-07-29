const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherStudentManagementRoutes = require(
  "../src/routes/teacherStudentManagementRoutes"
);

test("teacher student management registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    roster: factory("roster"),
    removal: factory("removal"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherStudentManagementRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["roster-router", "removal-router"]);
  assert.deepEqual(calls, [
    ["roster", { pool }],
    ["removal", { pool }],
  ]);
});
