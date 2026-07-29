const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherExamDetailController,
} = require("../controllers/teacherExamDetailController");

function teacherExamDetailRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherExamDetailController({ pool });

  router.get(
    "/teacher/exams/:id",
    authMiddleware,
    requireTeacher,
    controller.getExamDetail
  );

  return router;
}

module.exports = teacherExamDetailRoutes;
