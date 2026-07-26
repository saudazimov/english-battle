const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherWeeklyAiReportController,
} = require("../controllers/teacherWeeklyAiReportController");

function createTeacherWeeklyAiReportRoutes({
  pool,
  premium,
  aiSnapshot,
  aiService,
}) {
  const router = express.Router();
  const controller = createTeacherWeeklyAiReportController({
    pool,
    aiSnapshot,
    aiService,
  });
  router.post(
    "/ai/reports/teacher/classes/:classId/weekly",
    authMiddleware,
    requireTeacher,
    premium.requirePremium("teacher"),
    controller.generate
  );
  return router;
}

module.exports = createTeacherWeeklyAiReportRoutes;
