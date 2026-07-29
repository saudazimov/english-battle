const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentCreateController,
} = require("../controllers/adminTournamentCreateController");

function adminTournamentCreateRoutes({ pool, sanitizeText }) {
  const router = express.Router();
  const controller = createAdminTournamentCreateController({ pool, sanitizeText });

  router.post("/admin/tournaments/create", requireAdmin, controller.createTournament);

  return router;
}

module.exports = adminTournamentCreateRoutes;
