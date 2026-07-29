const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminSchoolRoutes = require("../src/routes/adminSchoolRoutes");

test("admin school registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    schools: factory("schools"),
    students: factory("students"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminSchoolRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["schools-router", "students-router"]);
  assert.deepEqual(calls, [
    ["schools", { pool }],
    ["students", { pool }],
  ]);
});
