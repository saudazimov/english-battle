const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const { createTeacherClassArchiveController } = require("../controllers/teacherClassArchiveController");

function createTeacherClassArchiveRoutes({ logAudit }) {
  const router = express.Router();
  const controller = createTeacherClassArchiveController({ pool, logAudit });
  router.post("/teacher/classes/:classId/archive", authMiddleware, requireTeacher, controller.archive);
  return router;
}

module.exports = createTeacherClassArchiveRoutes;
