const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherAssignmentResultsController,
} = require("../controllers/teacherAssignmentResultsController");

function teacherAssignmentResultsRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeacherAssignmentResultsController({ pool });

  router.get(
    "/teacher/assignments/:id/results",
    authMiddleware,
    requireTeacher,
    controller.getResults
  );

  return router;
}

module.exports = teacherAssignmentResultsRoutes;
