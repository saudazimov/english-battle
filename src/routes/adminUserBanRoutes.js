const express = require("express");
const { requireAdmin } = require("../../auth");
const { createAdminUserBanController } = require("../controllers/adminUserBanController");

function createAdminUserBanRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminUserBanController({ pool, logAudit });
  router.post("/admin/users/ban", requireAdmin, controller.update);
  return router;
}

module.exports = createAdminUserBanRoutes;
