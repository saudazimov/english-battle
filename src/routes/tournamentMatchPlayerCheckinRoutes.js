const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createTournamentMatchPlayerCheckinController,
} = require("../controllers/tournamentMatchPlayerCheckinController");

function tournamentMatchPlayerCheckinRoutes({ pool, notifyMatchPlayers }) {
  const router = express.Router();
  const controller = createTournamentMatchPlayerCheckinController({
    pool,
    notifyMatchPlayers,
  });

  router.post(
    "/tournament/match/:id/checkin",
    authMiddleware,
    controller.checkIn
  );

  return router;
}

module.exports = tournamentMatchPlayerCheckinRoutes;
