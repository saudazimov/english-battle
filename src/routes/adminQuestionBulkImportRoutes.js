const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionBulkImportController,
} = require("../controllers/adminQuestionBulkImportController");

function adminQuestionBulkImportRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminQuestionBulkImportController({ pool, logAudit });

  router.post(
    "/admin/questions/bulk-import",
    requireAdmin,
    controller.importQuestions
  );

  return router;
}

module.exports = adminQuestionBulkImportRoutes;
