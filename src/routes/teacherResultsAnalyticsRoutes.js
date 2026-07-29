const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherResultsAnalyticsController,
} = require("../controllers/teacherResultsAnalyticsController");

function teacherResultsAnalyticsRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherResultsAnalyticsController({ pool });

  router.get(
    "/teacher/results/:assignmentId",
    authMiddleware,
    requireTeacher,
    controller.getResults
  );

  return router;
}

module.exports = teacherResultsAnalyticsRoutes;
