const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentEditController,
} = require("../controllers/adminTournamentEditController");

function adminTournamentEditRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminTournamentEditController({ pool });

  router.post("/admin/tournaments/:id/edit", requireAdmin, controller.edit);

  return router;
}

module.exports = adminTournamentEditRoutes;
