const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionDeleteController,
} = require("../controllers/adminQuestionDeleteController");

function createAdminQuestionDeleteRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminQuestionDeleteController({ pool, logAudit });
  router.post("/admin/questions/delete", requireAdmin, controller.remove);
  return router;
}

module.exports = createAdminQuestionDeleteRoutes;
