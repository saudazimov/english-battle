const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminTournamentCatalogRoutes = require(
  "../src/routes/adminTournamentCatalogRoutes"
);

test("admin tournament catalog registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const sanitizeText = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    create: factory("create"),
    list: factory("list"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminTournamentCatalogRoutes({
    app,
    pool,
    sanitizeText,
    routeFactories,
  });

  assert.deepEqual(mounted, ["create-router", "list-router"]);
  assert.deepEqual(calls, [
    ["create", { pool, sanitizeText }],
    ["list", { pool }],
  ]);
});
