const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createNotificationListController } = require("../controllers/notificationListController");

function createNotificationListRoutes() {
  const router = express.Router();
  const controller = createNotificationListController({ pool });
  router.get("/notifications/:userId", authMiddleware, controller.list);
  return router;
}

module.exports = createNotificationListRoutes;
