const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentWeeklyAiReportController,
} = require("../controllers/studentWeeklyAiReportController");

function createStudentWeeklyAiReportRoutes({
  pool,
  aiSnapshot,
  aiService,
}) {
  const router = express.Router();
  const controller = createStudentWeeklyAiReportController({
    pool,
    aiSnapshot,
    aiService,
  });
  router.post(
    "/ai/reports/student/weekly",
    authMiddleware,
    requireStudent,
    controller.generate
  );
  return router;
}

module.exports = createStudentWeeklyAiReportRoutes;
