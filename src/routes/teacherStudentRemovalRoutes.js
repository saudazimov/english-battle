const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherStudentRemovalController,
} = require("../controllers/teacherStudentRemovalController");

function teacherStudentRemovalRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherStudentRemovalController({ pool });

  router.delete(
    "/teacher/classes/:classId/students/:studentId",
    authMiddleware,
    requireTeacher,
    controller.removeStudent
  );

  return router;
}

module.exports = teacherStudentRemovalRoutes;
