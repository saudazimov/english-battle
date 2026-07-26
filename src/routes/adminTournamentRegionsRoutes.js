const express = require("express");
const { requireAdmin } = require("../../auth");
const { REGIONS } = require("../../regions");
const {
  createAdminTournamentRegionsController,
} = require("../controllers/adminTournamentRegionsController");

function createAdminTournamentRegionsRoutes() {
  const router = express.Router();
  const controller = createAdminTournamentRegionsController({ regions: REGIONS });
  router.get("/admin/tournaments/regions-list", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminTournamentRegionsRoutes;
