const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminStudentProvisioningController,
} = require("../controllers/adminStudentProvisioningController");

function adminStudentProvisioningRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminStudentProvisioningController({ pool, logAudit });

  router.post("/admin/students/provision", requireAdmin, controller.provision);
  router.post("/admin/students/:id/reset-password", requireAdmin, controller.resetPassword);
  return router;
}

module.exports = adminStudentProvisioningRoutes;
