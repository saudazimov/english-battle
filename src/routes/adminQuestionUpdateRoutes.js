const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionUpdateController,
} = require("../controllers/adminQuestionUpdateController");

function createAdminQuestionUpdateRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminQuestionUpdateController({ pool, logAudit });
  router.post("/admin/questions/edit", requireAdmin, controller.update);
  router.get("/admin/questions/:id/analysis", requireAdmin, controller.getAnalysis);
  router.post("/admin/questions/:id/analysis/review", requireAdmin, controller.reviewAnalysis);
  router.post("/admin/questions/:id/analysis/requeue", requireAdmin, controller.requeueAnalysis);
  return router;
}

module.exports = createAdminQuestionUpdateRoutes;
