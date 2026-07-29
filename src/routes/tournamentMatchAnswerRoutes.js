const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createTournamentMatchAnswerController,
} = require("../controllers/tournamentMatchAnswerController");

function tournamentMatchAnswerRoutes(dependencies) {
  const router = express.Router();
  const controller = createTournamentMatchAnswerController(dependencies);

  router.post(
    "/tournament/match/:id/answer",
    authMiddleware,
    controller.submitAnswer
  );

  return router;
}

module.exports = tournamentMatchAnswerRoutes;
