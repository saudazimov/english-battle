const test = require("node:test");
const assert = require("node:assert/strict");

const { createAuthSessionRoutes } = require("../src/routes/authSessionRoutes");

test("auth session routes preserve phased mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = { use(router) { mounted.push(router); } };
  const dependencies = {
    pool: {},
    bcrypt: {},
    loginGate: () => {},
    noteFail: () => {},
    noteOk: () => {},
    phoneIpKey: () => {},
    signToken: () => {},
  };
  const routeFactories = {
    login(routeDependencies) {
      calls.push(["login", routeDependencies]);
      return "login-router";
    },
    logout() {
      calls.push(["logout"]);
      return "logout-router";
    },
  };
  const routes = createAuthSessionRoutes({
    ...dependencies,
    routeFactories,
  });

  routes.registerLoginRoutes(app);
  app.use("intermediate-router");
  routes.registerLogoutRoutes(app);

  assert.deepEqual(mounted, [
    "login-router",
    "intermediate-router",
    "logout-router",
  ]);
  assert.deepEqual(calls, [
    ["login", dependencies],
    ["logout"],
  ]);
});
