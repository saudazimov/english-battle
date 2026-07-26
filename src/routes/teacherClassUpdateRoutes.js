const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const { createTeacherClassUpdateController } = require("../controllers/teacherClassUpdateController");

function createTeacherClassUpdateRoutes({ sanitizeText, logAudit }) {
  const router = express.Router();
  const controller = createTeacherClassUpdateController({ pool, sanitizeText, logAudit });
  router.put("/teacher/classes/:classId", authMiddleware, requireTeacher, controller.update);
  return router;
}

module.exports = createTeacherClassUpdateRoutes;
