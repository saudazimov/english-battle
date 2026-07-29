const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentExamAttemptAnswerController,
} = require("../controllers/studentExamAttemptAnswerController");

function studentExamAttemptAnswerRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentExamAttemptAnswerController({ pool });

  router.post(
    "/student/exams/attempts/:attemptId/answer",
    authMiddleware,
    requireStudent,
    controller.saveAnswer
  );

  return router;
}

module.exports = studentExamAttemptAnswerRoutes;
