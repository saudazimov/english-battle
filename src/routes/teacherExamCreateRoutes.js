const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherExamCreateController,
} = require("../controllers/teacherExamCreateController");

function teacherExamCreateRoutes({ pool, sanitizeText, logAudit }) {
  const router = express.Router();
  const controller = createTeacherExamCreateController({ pool, sanitizeText, logAudit });

  router.post("/teacher/exams", authMiddleware, requireTeacher, controller.createExam);

  return router;
}

module.exports = teacherExamCreateRoutes;
