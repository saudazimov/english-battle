const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentAssignmentReviewController,
} = require("../controllers/studentAssignmentReviewController");

function studentAssignmentReviewRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentAssignmentReviewController({ pool });

  router.get(
    "/student/assignments/:id/review",
    authMiddleware,
    requireStudent,
    controller.getReview
  );

  return router;
}

module.exports = studentAssignmentReviewRoutes;
