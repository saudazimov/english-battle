const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionHealthController,
} = require("../controllers/adminQuestionHealthController");

function createAdminQuestionHealthRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminQuestionHealthController({ pool });
  router.get("/admin/questions/health", requireAdmin, controller.getHealth);
  return router;
}

module.exports = createAdminQuestionHealthRoutes;
