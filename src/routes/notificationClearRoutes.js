const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createNotificationClearController } = require("../controllers/notificationClearController");

function createNotificationClearRoutes() {
  const router = express.Router();
  const controller = createNotificationClearController({ pool });
  router.post("/notifications/clear/:userId", authMiddleware, controller.clearAll);
  return router;
}

module.exports = createNotificationClearRoutes;
