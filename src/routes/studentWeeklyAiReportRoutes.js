const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentWeeklyAiReportController,
} = require("../controllers/studentWeeklyAiReportController");

function createStudentWeeklyAiReportRoutes({
  pool,
  premium,
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
    premium.requirePremium("student"),
    controller.generate
  );
  return router;
}

module.exports = createStudentWeeklyAiReportRoutes;
