const test = require("node:test");
const assert = require("node:assert/strict");
const registerLevelExamRoutes = require("../src/routes/levelExamRoutes");

test("level exam registrar disables legacy CEFR exam routes by default", () => {
  const mounted = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerLevelExamRoutes({ app, pool: {}, getNextLevel() {}, randomUUID() {} });

  assert.equal(mounted.length, 1);
  const routes = mounted[0].stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      handlers: layer.route.stack.length,
    }));
  assert.deepEqual(routes, [
    { path: "/exam/status/:userId", methods: ["get"], handlers: 2 },
    { path: "/exam/start/:userId", methods: ["get"], handlers: 2 },
    { path: "/exam/submit", methods: ["post"], handlers: 2 },
    { path: "/exam/history/:userId", methods: ["get"], handlers: 2 },
  ]);
});

test("level exam registrar retains the legacy implementation for rollback", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const getNextLevel = () => {};
  const randomUUID = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    status: factory("status"),
    start: factory("start"),
    submit: factory("submit"),
    history: factory("history"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerLevelExamRoutes({
    app,
    pool,
    getNextLevel,
    randomUUID,
    routeFactories,
    enabled: true,
  });

  assert.deepEqual(mounted, [
    "status-router",
    "start-router",
    "submit-router",
    "history-router",
  ]);
  assert.deepEqual(calls, [
    ["status", { pool, getNextLevel }],
    ["start", { pool, randomUUID }],
    ["submit", { pool, getNextLevel }],
    ["history", { pool }],
  ]);
});
