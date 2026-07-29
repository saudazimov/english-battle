const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherAiReportRoutes = require(
  "../src/routes/teacherAiReportRoutes"
);

test("teacher AI report registrar preserves order and dependencies", () => {
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
    detail: factory("detail"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherAiReportRoutes({
    app,
    pool,
    premium,
    aiSnapshot,
    aiService,
    routeFactories,
  });

  assert.deepEqual(mounted, ["weekly-router", "list-router", "detail-router"]);
  assert.deepEqual(calls, [
    ["weekly", { pool, premium, aiSnapshot, aiService }],
    ["list", { pool }],
    ["detail", { pool }],
  ]);
});
