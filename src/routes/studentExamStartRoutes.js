const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentExamStartController,
} = require("../controllers/studentExamStartController");

function studentExamStartRoutes({ pool, gradeAttempt }) {
  const router = express.Router();
  const controller = createStudentExamStartController({ pool, gradeAttempt });

  router.post(
    "/student/exams/:id/start",
    authMiddleware,
    requireStudent,
    controller.startExam
  );

  return router;
}

module.exports = studentExamStartRoutes;
