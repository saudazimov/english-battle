const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentListController,
} = require("../controllers/adminTournamentListController");

function createAdminTournamentListRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminTournamentListController({ pool });
  router.get("/admin/tournaments/list", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminTournamentListRoutes;
