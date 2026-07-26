const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const { createTeacherClassListController } = require("../controllers/teacherClassListController");

function createTeacherClassListRoutes() {
  const router = express.Router();
  const controller = createTeacherClassListController({ pool });
  router.get("/teacher/classes", authMiddleware, requireTeacher, controller.list);
  return router;
}

module.exports = createTeacherClassListRoutes;
