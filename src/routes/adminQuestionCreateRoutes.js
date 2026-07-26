const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionCreateController,
} = require("../controllers/adminQuestionCreateController");

function createAdminQuestionCreateRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createAdminQuestionCreateController({ pool, logAudit });
  router.post("/admin/questions/add", requireAdmin, controller.create);
  return router;
}

module.exports = createAdminQuestionCreateRoutes;
