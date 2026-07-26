const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminSchoolStudentListController,
} = require("../controllers/adminSchoolStudentListController");

function createAdminSchoolStudentListRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminSchoolStudentListController({ pool });
  router.get("/admin/schools/students", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminSchoolStudentListRoutes;
