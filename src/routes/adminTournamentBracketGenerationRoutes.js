const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentBracketGenerationController,
} = require("../controllers/adminTournamentBracketGenerationController");

function adminTournamentBracketGenerationRoutes({ pool, seedOrder, propagateByes }) {
  const router = express.Router();
  const controller = createAdminTournamentBracketGenerationController({
    pool,
    seedOrder,
    propagateByes,
  });

  router.post(
    "/admin/tournaments/:id/generate-bracket",
    requireAdmin,
    controller.generateBracket
  );

  return router;
}

module.exports = adminTournamentBracketGenerationRoutes;
