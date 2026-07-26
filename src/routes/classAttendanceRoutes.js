const express = require("express");
const {
  authMiddleware,
  requireStudent,
  requireTeacher,
} = require("../../auth");
const {
  createClassAttendanceController,
} = require("../controllers/classAttendanceController");

function createClassAttendanceRoutes(dependencies) {
  const router = express.Router();
  const controller = createClassAttendanceController(dependencies);

  router.get(
    "/teacher/classes/:classId/attendance",
    authMiddleware,
    requireTeacher,
    controller.listTeacherAttendance
  );
  router.post(
    "/teacher/classes/:classId/attendance",
    authMiddleware,
    requireTeacher,
    controller.createTeacherAttendance
  );
  router.put(
    "/teacher/classes/:classId/attendance/:sessionId",
    authMiddleware,
    requireTeacher,
    controller.updateTeacherAttendance
  );
  router.get(
    "/student/classes/:classId/attendance",
    authMiddleware,
    requireStudent,
    controller.listStudentAttendance
  );

  return router;
}

module.exports = createClassAttendanceRoutes;
