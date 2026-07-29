const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createTournamentMatchCheckinStateController,
} = require("../controllers/tournamentMatchCheckinStateController");

function tournamentMatchCheckinStateRoutes({ pool }) {
  const router = express.Router();
  const controller = createTournamentMatchCheckinStateController({ pool });

  router.get(
    "/tournament/match/:id/checkin-state",
    authMiddleware,
    controller.getCheckinState
  );

  return router;
}

module.exports = tournamentMatchCheckinStateRoutes;
