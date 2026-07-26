const express = require("express");
const pool = require("../../db");
const premium = require("../../premium");
const { authMiddleware, requireTeacher } = require("../../auth");
const { createTeacherClassCreateController } = require("../controllers/teacherClassCreateController");

function createTeacherClassCreateRoutes({ sanitizeText, logAudit }) {
  const router = express.Router();
  const controller = createTeacherClassCreateController({ pool, premium, sanitizeText, logAudit });
  router.post("/teacher/classes", authMiddleware, requireTeacher, controller.create);
  return router;
}

module.exports = createTeacherClassCreateRoutes;
