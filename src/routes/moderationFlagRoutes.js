const express = require("express");
const { authMiddleware, requireAdmin } = require("../../auth");
const {
  createModerationFlagController,
} = require("../controllers/moderationFlagController");

function createModerationFlagRoutes(dependencies) {
  const router = express.Router();
  const controller = createModerationFlagController(dependencies);

  router.post("/flags/report", authMiddleware, controller.report);
  router.get("/admin/flags", requireAdmin, controller.list);
  router.post("/admin/flags/resolve", requireAdmin, controller.resolve);

  return router;
}

module.exports = createModerationFlagRoutes;
