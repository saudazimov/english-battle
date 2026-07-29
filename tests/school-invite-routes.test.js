const test = require("node:test");
const assert = require("node:assert/strict");
const registerSchoolInviteRoutes = require("../src/routes/schoolInviteRoutes");

test("school invite registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const schoolInvite = {};
  const schoolCodeLookupLimiter = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    verification: factory("verification"),
    creation: factory("creation"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerSchoolInviteRoutes({
    app,
    pool,
    schoolInvite,
    schoolCodeLookupLimiter,
    routeFactories,
  });

  assert.deepEqual(mounted, ["verification-router", "creation-router"]);
  assert.deepEqual(calls, [
    ["verification", { pool, schoolInvite, schoolCodeLookupLimiter }],
    ["creation", { pool }],
  ]);
});
