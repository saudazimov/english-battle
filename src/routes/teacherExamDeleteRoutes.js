const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherExamDeleteController,
} = require("../controllers/teacherExamDeleteController");

function teacherExamDeleteRoutes({ pool, logAudit }) {
  const router = express.Router();
  const controller = createTeacherExamDeleteController({ pool, logAudit });

  router.delete(
    "/teacher/exams/:id",
    authMiddleware,
    requireTeacher,
    controller.deleteExam
  );

  return router;
}

module.exports = teacherExamDeleteRoutes;
