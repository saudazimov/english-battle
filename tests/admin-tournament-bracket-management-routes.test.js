const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminTournamentBracketManagementRoutes = require(
  "../src/routes/adminTournamentBracketManagementRoutes"
);

test("admin tournament bracket registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const seedOrder = () => {};
  const propagateByes = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    generation: factory("generation"),
    bracket: factory("bracket"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminTournamentBracketManagementRoutes({
    app,
    pool,
    seedOrder,
    propagateByes,
    routeFactories,
  });

  assert.deepEqual(mounted, ["generation-router", "bracket-router"]);
  assert.deepEqual(calls, [
    ["generation", { pool, seedOrder, propagateByes }],
    ["bracket", { pool }],
  ]);
});
