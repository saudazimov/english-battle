const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherSettingsProfileReadController,
} = require("../controllers/teacherSettingsProfileReadController");

function createTeacherSettingsProfileReadRoutes() {
  const router = express.Router();
  const controller = createTeacherSettingsProfileReadController({ pool });
  router.get("/teacher/settings/profile", authMiddleware, requireTeacher, controller.getProfile);
  return router;
}

module.exports = createTeacherSettingsProfileReadRoutes;
