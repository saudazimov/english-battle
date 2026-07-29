const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createTournamentMatchBattleStateController,
} = require("../controllers/tournamentMatchBattleStateController");

function tournamentMatchBattleStateRoutes({ pool }) {
  const router = express.Router();
  const controller = createTournamentMatchBattleStateController({ pool });

  router.get(
    "/tournament/match/:id/battle-state",
    authMiddleware,
    controller.getBattleState
  );

  return router;
}

module.exports = tournamentMatchBattleStateRoutes;
