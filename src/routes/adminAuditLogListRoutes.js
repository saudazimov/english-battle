const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminAuditLogListController,
} = require("../controllers/adminAuditLogListController");

function createAdminAuditLogListRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminAuditLogListController({ pool });
  router.get("/admin/audit-logs", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminAuditLogListRoutes;
