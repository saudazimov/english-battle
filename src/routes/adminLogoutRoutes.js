const express = require("express");
const { requireAdmin } = require("../../auth");
const { createAdminLogoutController } = require("../controllers/adminLogoutController");

function createAdminLogoutRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminLogoutController({ pool, logAudit });
  router.post("/admin/logout", requireAdmin, controller.logout);
  return router;
}

module.exports = createAdminLogoutRoutes;
