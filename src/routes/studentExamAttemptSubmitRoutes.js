const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentExamAttemptSubmitController,
} = require("../controllers/studentExamAttemptSubmitController");

function studentExamAttemptSubmitRoutes({ pool, gradeAttempt }) {
  const router = express.Router();
  const controller = createStudentExamAttemptSubmitController({ pool, gradeAttempt });

  router.post(
    "/student/exams/attempts/:attemptId/submit",
    authMiddleware,
    requireStudent,
    controller.submitAttempt
  );

  return router;
}

module.exports = studentExamAttemptSubmitRoutes;
