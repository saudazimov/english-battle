const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const { createTeacherOverviewController } = require("../controllers/teacherOverviewController");

function teacherOverviewRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherOverviewController({ pool });
  router.get("/teacher/overview", authMiddleware, requireTeacher, controller.getOverview);
  return router;
}

module.exports = teacherOverviewRoutes;
