const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminUserUpdateController,
} = require("../controllers/adminUserUpdateController");

function createAdminUserUpdateRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminUserUpdateController({ pool, logAudit });
  router.post("/admin/users/update", requireAdmin, controller.update);
  return router;
}

module.exports = createAdminUserUpdateRoutes;
