const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentExamAttemptResultController,
} = require("../controllers/studentExamAttemptResultController");

function studentExamAttemptResultRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentExamAttemptResultController({ pool });

  router.get(
    "/student/exams/attempts/:attemptId/result",
    authMiddleware,
    requireStudent,
    controller.getAttemptResult
  );

  return router;
}

module.exports = studentExamAttemptResultRoutes;
