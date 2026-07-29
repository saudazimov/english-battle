const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherClassAssignmentListController,
} = require("../controllers/teacherClassAssignmentListController");

function teacherClassAssignmentListRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherClassAssignmentListController({ pool });

  router.get(
    "/teacher/classes/:classId/assignments",
    authMiddleware,
    requireTeacher,
    controller.listAssignments
  );

  return router;
}

module.exports = teacherClassAssignmentListRoutes;
