const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherAssignmentListController,
} = require("../controllers/teacherAssignmentListController");

function teacherAssignmentListRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherAssignmentListController({ pool });

  router.get("/teacher/assignments", authMiddleware, requireTeacher, controller.list);

  return router;
}

module.exports = teacherAssignmentListRoutes;
