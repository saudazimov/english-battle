const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentDeleteController,
} = require("../controllers/adminTournamentDeleteController");

function createAdminTournamentDeleteRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminTournamentDeleteController({ pool });
  router.post("/admin/tournaments/:id/delete", requireAdmin, controller.remove);
  return router;
}

module.exports = createAdminTournamentDeleteRoutes;
