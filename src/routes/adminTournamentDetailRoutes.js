const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentDetailController,
} = require("../controllers/adminTournamentDetailController");

function createAdminTournamentDetailRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminTournamentDetailController({ pool });
  router.get("/admin/tournaments/:id", requireAdmin, controller.get);
  return router;
}

module.exports = createAdminTournamentDetailRoutes;
