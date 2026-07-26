const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherSettingsProfileUpdateController,
} = require("../controllers/teacherSettingsProfileUpdateController");

function createTeacherSettingsProfileUpdateRoutes({ sanitizeText }) {
  const router = express.Router();
  const controller = createTeacherSettingsProfileUpdateController({ pool, sanitizeText });
  router.put("/teacher/settings/profile", authMiddleware, requireTeacher, controller.updateProfile);
  return router;
}

module.exports = createTeacherSettingsProfileUpdateRoutes;
