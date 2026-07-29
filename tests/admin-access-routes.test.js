const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminAccessRoutes } = require("../src/routes/adminAccessRoutes");

test("admin access routes preserve phased mounts and dependencies", () => {
  const calls = [];
  const app = {
    use(router) {
      calls.push(["mount", router]);
    },
  };
  const dependencies = {
    pool: {},
    logAudit() {},
    bcrypt: {},
  };
  const factories = {
    createAuth(receivedDependencies) {
      calls.push(["auth", receivedDependencies]);
      return {
        loginRouter: "admin-login-router",
        passwordRouter: "admin-password-router",
      };
    },
    registerSession(receivedDependencies) {
      calls.push(["session", receivedDependencies]);
    },
  };

  const routes = createAdminAccessRoutes(dependencies, factories);
  routes.registerLoginRoutes(app);
  routes.registerSessionRoutes(app);
  routes.registerPasswordRoutes(app);

  assert.deepEqual(calls, [
    ["auth", dependencies],
    ["mount", "admin-login-router"],
    ["session", {
      app,
      pool: dependencies.pool,
      logAudit: dependencies.logAudit,
    }],
    ["mount", "admin-password-router"],
  ]);
});
