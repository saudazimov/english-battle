const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createNotificationDeleteController } = require("../controllers/notificationDeleteController");

function createNotificationDeleteRoutes() {
  const router = express.Router();
  const controller = createNotificationDeleteController({ pool });
  router.delete("/notifications/:notifId", authMiddleware, controller.remove);
  return router;
}

module.exports = createNotificationDeleteRoutes;
