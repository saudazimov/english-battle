const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createStudentTournamentBracketController,
} = require("../controllers/studentTournamentBracketController");

function studentTournamentBracketRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentTournamentBracketController({ pool });

  router.get(
    "/student/tournaments/:id/bracket",
    authMiddleware,
    controller.getBracket
  );

  return router;
}

module.exports = studentTournamentBracketRoutes;
