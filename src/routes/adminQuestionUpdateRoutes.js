const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionUpdateController,
} = require("../controllers/adminQuestionUpdateController");

function createAdminQuestionUpdateRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminQuestionUpdateController({ pool, logAudit });
  router.post("/admin/questions/edit", requireAdmin, controller.update);
  return router;
}

module.exports = createAdminQuestionUpdateRoutes;
