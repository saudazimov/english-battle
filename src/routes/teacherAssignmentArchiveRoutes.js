const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherAssignmentArchiveController,
} = require("../controllers/teacherAssignmentArchiveController");

function teacherAssignmentArchiveRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherAssignmentArchiveController({ pool });

  router.post(
    "/teacher/assignments/:id/archive",
    authMiddleware,
    requireTeacher,
    controller.archiveAssignment
  );

  return router;
}

module.exports = teacherAssignmentArchiveRoutes;
