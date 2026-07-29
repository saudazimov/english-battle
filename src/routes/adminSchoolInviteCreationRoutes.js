const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminSchoolInviteCreationController,
} = require("../controllers/adminSchoolInviteCreationController");

function adminSchoolInviteCreationRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminSchoolInviteCreationController({ pool });

  router.post("/admin/school-invites", requireAdmin, controller.create);

  return router;
}

module.exports = adminSchoolInviteCreationRoutes;
