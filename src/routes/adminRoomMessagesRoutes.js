const express = require("express");
const pool = require("../../db");
const { requireAdmin } = require("../../auth");
const { createAdminRoomMessagesController } = require("../controllers/adminRoomMessagesController");

function createAdminRoomMessagesRoutes() {
  const router = express.Router();
  const controller = createAdminRoomMessagesController({ pool });
  router.get("/admin/room-messages", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminRoomMessagesRoutes;
