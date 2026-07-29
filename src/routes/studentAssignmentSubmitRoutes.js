const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentAssignmentSubmitController,
} = require("../controllers/studentAssignmentSubmitController");

function studentAssignmentSubmitRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentAssignmentSubmitController({ pool });

  router.post(
    "/student/assignments/:id/submit",
    authMiddleware,
    requireStudent,
    controller.submitAssignment
  );

  return router;
}

module.exports = studentAssignmentSubmitRoutes;
