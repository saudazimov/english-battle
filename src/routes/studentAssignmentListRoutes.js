const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentAssignmentListController,
} = require("../controllers/studentAssignmentListController");

function studentAssignmentListRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentAssignmentListController({ pool });

  router.get("/student/assignments", authMiddleware, requireStudent, controller.list);

  return router;
}

module.exports = studentAssignmentListRoutes;
