const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentExamListController,
} = require("../controllers/studentExamListController");

function studentExamListRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentExamListController({ pool });

  router.get("/student/exams", authMiddleware, requireStudent, controller.listExams);

  return router;
}

module.exports = studentExamListRoutes;
