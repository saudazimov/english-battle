const test = require("node:test");
const assert = require("node:assert/strict");
const registerLevelExamRoutes = require("../src/routes/levelExamRoutes");

test("level exam registrar preserves order and dependencies", () => {
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
