const express = require("express");
const pool = require("../../db");
const { requireAdmin } = require("../../auth");
const { createAdminUserMessagesController } = require("../controllers/adminUserMessagesController");

function createAdminUserMessagesRoutes() {
  const router = express.Router();
  const controller = createAdminUserMessagesController({ pool });
  router.get("/admin/users/:id/messages", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminUserMessagesRoutes;
