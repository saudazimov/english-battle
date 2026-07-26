const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const { createTeacherDashboardController } = require("../controllers/teacherDashboardController");

function createTeacherDashboardRoutes() {
  const router = express.Router();
  const controller = createTeacherDashboardController({ pool });
  router.get("/teacher/dashboard", authMiddleware, requireTeacher, controller.getDashboard);
  return router;
}

module.exports = createTeacherDashboardRoutes;
