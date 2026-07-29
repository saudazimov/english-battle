const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminAnalyticsReportController,
} = require("../controllers/adminAnalyticsReportController");

function createAdminAnalyticsReportRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminAnalyticsReportController({ pool });
  router.get("/admin/reports", requireAdmin, controller.report);
  return router;
}

module.exports = createAdminAnalyticsReportRoutes;
