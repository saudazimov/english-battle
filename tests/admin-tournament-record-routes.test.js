const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminTournamentRecordRoutes = require(
  "../src/routes/adminTournamentRecordRoutes"
);

test("admin tournament record registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    detail: factory("detail"),
    edit: factory("edit"),
    remove: factory("remove"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminTournamentRecordRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, ["detail-router", "edit-router", "remove-router"]);
  assert.deepEqual(calls, [
    ["detail", { pool }],
    ["edit", { pool }],
    ["remove", { pool }],
  ]);
});
