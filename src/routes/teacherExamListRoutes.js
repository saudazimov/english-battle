const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherExamListController,
} = require("../controllers/teacherExamListController");

function teacherExamListRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherExamListController({ pool });

  router.get("/teacher/exams", authMiddleware, requireTeacher, controller.listExams);

  return router;
}

module.exports = teacherExamListRoutes;
