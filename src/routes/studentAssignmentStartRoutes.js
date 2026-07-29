const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentAssignmentStartController,
} = require("../controllers/studentAssignmentStartController");

function studentAssignmentStartRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentAssignmentStartController({ pool });

  router.get(
    "/student/assignments/:id/start",
    authMiddleware,
    requireStudent,
    controller.startAssignment
  );

  return router;
}

module.exports = studentAssignmentStartRoutes;
