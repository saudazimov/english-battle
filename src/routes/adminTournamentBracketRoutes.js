const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentBracketController,
} = require("../controllers/adminTournamentBracketController");

function adminTournamentBracketRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminTournamentBracketController({ pool });

  router.get("/admin/tournaments/:id/bracket", requireAdmin, controller.getBracket);

  return router;
}

module.exports = adminTournamentBracketRoutes;
