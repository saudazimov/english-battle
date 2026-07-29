const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createTournamentMatchFinishController,
} = require("../controllers/tournamentMatchFinishController");

function tournamentMatchFinishRoutes(dependencies) {
  const router = express.Router();
  const controller = createTournamentMatchFinishController(dependencies);

  router.post(
    "/tournament/match/:id/finish",
    authMiddleware,
    controller.finishMatch
  );

  return router;
}

module.exports = tournamentMatchFinishRoutes;
