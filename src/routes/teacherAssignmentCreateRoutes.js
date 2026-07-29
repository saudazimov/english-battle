const express = require("express");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherAssignmentCreateController,
} = require("../controllers/teacherAssignmentCreateController");

function teacherAssignmentCreateRoutes({ pool, premium, logAudit, sanitizeText }) {
  const router = express.Router();
  const controller = createTeacherAssignmentCreateController({
    pool,
    premium,
    logAudit,
    sanitizeText,
  });

  router.post(
    "/teacher/classes/:classId/assignments",
    authMiddleware,
    requireTeacher,
    controller.createAssignment
  );

  return router;
}

module.exports = teacherAssignmentCreateRoutes;
