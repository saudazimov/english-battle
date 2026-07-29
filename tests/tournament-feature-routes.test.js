const test = require("node:test");
const assert = require("node:assert/strict");

const tournamentFeatureRoutes = require("../src/routes/tournamentFeatureRoutes");

test("tournament feature routes preserve phased dependencies", () => {
  const calls = [];
  const app = {};
  const pool = {};
  const sanitizeText = () => {};
  const seedOrder = () => {};
  const propagateByes = () => {};
  const expireTournamentMatch = () => {};
  const checkMatchCompletion = () => {};
  const notifyMatchPlayers = () => {};
  const routes = {
    registerAdmin(dependencies) {
      calls.push(["admin", dependencies]);
    },
    registerStudent(dependencies) {
      calls.push(["student", dependencies]);
    },
    registerMatch(dependencies) {
      calls.push(["match", dependencies]);
    },
  };

  tournamentFeatureRoutes.registerAdminRoutes({
    app,
    pool,
    sanitizeText,
    seedOrder,
    propagateByes,
    routes,
  });
  tournamentFeatureRoutes.registerStudentRoutes({ app, pool, routes });
  tournamentFeatureRoutes.registerMatchRoutes({
    app,
    pool,
    expireTournamentMatch,
    checkMatchCompletion,
    notifyMatchPlayers,
    routes,
  });

  assert.deepEqual(calls, [
    ["admin", { app, pool, sanitizeText, seedOrder, propagateByes }],
    ["student", { app, pool }],
    ["match", {
      app,
      pool,
      expireTournamentMatch,
      checkMatchCompletion,
      notifyMatchPlayers,
    }],
  ]);
});
