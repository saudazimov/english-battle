const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherAiReportDetailController,
} = require("../controllers/teacherAiReportDetailController");

function createTeacherAiReportDetailRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherAiReportDetailController({ pool });
  router.get(
    "/teacher/ai-reports/:id",
    authMiddleware,
    requireTeacher,
    controller.getById
  );
  return router;
}

module.exports = createTeacherAiReportDetailRoutes;
