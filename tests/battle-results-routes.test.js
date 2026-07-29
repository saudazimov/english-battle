const test = require("node:test");
const assert = require("node:assert/strict");
const registerBattleResultsRoutes = require(
  "../src/routes/battleResultsRoutes"
);

test("battle results registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    history: factory("history"),
    battleResult: factory("battle-result"),
    teamBattleResult: factory("team-battle-result"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerBattleResultsRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, [
    "history-router",
    "battle-result-router",
    "team-battle-result-router",
  ]);
  assert.deepEqual(calls, [
    ["history", { pool }],
    ["battle-result", { pool }],
    ["team-battle-result", { pool }],
  ]);
});
