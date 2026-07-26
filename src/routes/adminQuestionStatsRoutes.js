const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionStatsController,
} = require("../controllers/adminQuestionStatsController");

function createAdminQuestionStatsRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminQuestionStatsController({ pool });
  router.get("/admin/questions/stats", requireAdmin, controller.getStats);
  return router;
}

module.exports = createAdminQuestionStatsRoutes;
