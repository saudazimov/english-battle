const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createNotificationReadController } = require("../controllers/notificationReadController");

function createNotificationReadRoutes() {
  const router = express.Router();
  const controller = createNotificationReadController({ pool });
  router.post("/notifications/read/:userId", authMiddleware, controller.markAllRead);
  return router;
}

module.exports = createNotificationReadRoutes;
