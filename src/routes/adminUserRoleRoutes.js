const express = require("express");
const { requireAdmin } = require("../../auth");
const { createAdminUserRoleController } = require("../controllers/adminUserRoleController");

function createAdminUserRoleRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminUserRoleController({ pool, logAudit });
  router.post("/admin/users/role", requireAdmin, controller.update);
  return router;
}

module.exports = createAdminUserRoleRoutes;
