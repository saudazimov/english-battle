const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherAiReportListController,
} = require("../controllers/teacherAiReportListController");

function createTeacherAiReportListRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherAiReportListController({ pool });
  router.get(
    "/teacher/ai-reports",
    authMiddleware,
    requireTeacher,
    controller.list
  );
  return router;
}

module.exports = createTeacherAiReportListRoutes;
