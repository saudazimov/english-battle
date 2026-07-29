const test = require("node:test");
const assert = require("node:assert/strict");
const registerModerationRoutes = require("../src/routes/moderationRoutes");

test("moderation registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const logAudit = () => {};
  const flags = (dependencies) => {
    calls.push(["flags", dependencies]);
    return "flags-router";
  };
  const count = (...args) => {
    calls.push(["count", args]);
    return "count-router";
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerModerationRoutes({
    app,
    pool,
    logAudit,
    routeFactories: { flags, count },
  });

  assert.deepEqual(mounted, ["flags-router", "count-router"]);
  assert.deepEqual(calls, [
    ["flags", { pool, logAudit }],
    ["count", []],
  ]);
});
