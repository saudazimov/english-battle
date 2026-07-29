const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminTournamentLookupRoutes = require(
  "../src/routes/adminTournamentLookupRoutes"
);

test("admin tournament lookup registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const regions = (...args) => {
    calls.push(["regions", args]);
    return "regions-router";
  };
  const districtSchools = (dependencies) => {
    calls.push(["district-schools", dependencies]);
    return "district-schools-router";
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminTournamentLookupRoutes({
    app,
    pool,
    routeFactories: { regions, districtSchools },
  });

  assert.deepEqual(mounted, ["regions-router", "district-schools-router"]);
  assert.deepEqual(calls, [
    ["regions", []],
    ["district-schools", { pool }],
  ]);
});
