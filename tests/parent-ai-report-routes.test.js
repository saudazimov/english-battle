const test = require("node:test");
const assert = require("node:assert/strict");
const registerParentAiReportRoutes = require(
  "../src/routes/parentAiReportRoutes"
);

test("parent AI report registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const premium = {};
  const aiSnapshot = {};
  const aiService = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    weekly: factory("weekly"),
    list: factory("list"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerParentAiReportRoutes({
    app,
    pool,
    premium,
    aiSnapshot,
    aiService,
    routeFactories,
  });

  assert.deepEqual(mounted, ["weekly-router", "list-router"]);
  assert.deepEqual(calls, [
    ["weekly", { pool, premium, aiSnapshot, aiService }],
    ["list", { pool, premium }],
  ]);
});
