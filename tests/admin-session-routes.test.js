const test = require("node:test");
const assert = require("node:assert/strict");

const registerAdminSessionRoutes = require("../src/routes/adminSessionRoutes");

test("admin session routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const logAudit = () => {};
  const routes = {
    me: "me-router",
    createLogout(dependencies) {
      calls.push(dependencies);
      return "logout-router";
    },
  };

  registerAdminSessionRoutes({ app, pool, logAudit, routes });

  assert.deepEqual(mounted, ["me-router", "logout-router"]);
  assert.deepEqual(calls, [{ pool, logAudit }]);
});
