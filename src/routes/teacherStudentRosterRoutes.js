const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherStudentRosterController,
} = require("../controllers/teacherStudentRosterController");

function teacherStudentRosterRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherStudentRosterController({ pool });

  router.get(
    "/teacher/classes/:classId/students",
    authMiddleware,
    requireTeacher,
    controller.classStudents
  );
  router.get("/teacher/students", authMiddleware, requireTeacher, controller.allStudents);

  return router;
}

module.exports = teacherStudentRosterRoutes;
