const test = require("node:test");
const assert = require("node:assert/strict");

const registerAdminTournamentRoutes = require("../src/routes/adminTournamentRoutes");

test("admin tournament routes preserve registrar order and dependencies", () => {
  const calls = [];
  const dependencies = {
    app: {},
    pool: {},
    sanitizeText() {},
    seedOrder() {},
    propagateByes() {},
  };
  const routes = {
    registerLookup(receivedDependencies) {
      calls.push(["lookup", receivedDependencies]);
    },
    registerCatalog(receivedDependencies) {
      calls.push(["catalog", receivedDependencies]);
    },
    registerBracketManagement(receivedDependencies) {
      calls.push(["bracket", receivedDependencies]);
    },
    registerRecord(receivedDependencies) {
      calls.push(["record", receivedDependencies]);
    },
  };

  registerAdminTournamentRoutes({ ...dependencies, routes });

  assert.deepEqual(calls, [
    ["lookup", { app: dependencies.app, pool: dependencies.pool }],
    ["catalog", {
      app: dependencies.app,
      pool: dependencies.pool,
      sanitizeText: dependencies.sanitizeText,
    }],
    ["bracket", {
      app: dependencies.app,
      pool: dependencies.pool,
      seedOrder: dependencies.seedOrder,
      propagateByes: dependencies.propagateByes,
    }],
    ["record", { app: dependencies.app, pool: dependencies.pool }],
  ]);
});
