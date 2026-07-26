const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminQuestionListController,
} = require("../controllers/adminQuestionListController");

function createAdminQuestionListRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminQuestionListController({ pool });
  router.get("/admin/questions", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminQuestionListRoutes;
