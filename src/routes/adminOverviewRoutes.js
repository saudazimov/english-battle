const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminOverviewController,
} = require("../controllers/adminOverviewController");

function createAdminOverviewRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminOverviewController({ pool });
  router.get("/admin/overview", requireAdmin, controller.getOverview);
  return router;
}

module.exports = createAdminOverviewRoutes;
