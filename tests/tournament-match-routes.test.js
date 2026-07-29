const test = require("node:test");
const assert = require("node:assert/strict");

const registerTournamentMatchRoutes = require("../src/routes/tournamentMatchRoutes");

test("tournament match routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const notifyMatchPlayers = () => {};
  const expireTournamentMatch = () => {};
  const checkMatchCompletion = () => {};
  const routeFactories = {
    checkinState(dependencies) {
      calls.push(["checkinState", dependencies]);
      return "checkin-state-router";
    },
    playerCheckin(dependencies) {
      calls.push(["playerCheckin", dependencies]);
      return "player-checkin-router";
    },
    battleState(dependencies) {
      calls.push(["battleState", dependencies]);
      return "battle-state-router";
    },
    answer(dependencies) {
      calls.push(["answer", dependencies]);
      return "answer-router";
    },
    finish(dependencies) {
      calls.push(["finish", dependencies]);
      return "finish-router";
    },
  };

  registerTournamentMatchRoutes({
    app,
    pool,
    notifyMatchPlayers,
    expireTournamentMatch,
    checkMatchCompletion,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "checkin-state-router",
    "player-checkin-router",
    "battle-state-router",
    "answer-router",
    "finish-router",
  ]);
  assert.deepEqual(calls, [
    ["checkinState", { pool }],
    ["playerCheckin", { pool, notifyMatchPlayers }],
    ["battleState", { pool }],
    ["answer", { pool, expireTournamentMatch, notifyMatchPlayers }],
    ["finish", { pool, expireTournamentMatch, checkMatchCompletion }],
  ]);
});
