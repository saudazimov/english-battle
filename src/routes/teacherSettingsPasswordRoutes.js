const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherSettingsPasswordController,
} = require("../controllers/teacherSettingsPasswordController");

function createTeacherSettingsPasswordRoutes({ validatePassword }) {
  const router = express.Router();
  const controller = createTeacherSettingsPasswordController({ pool, bcrypt, validatePassword });
  router.post("/teacher/settings/password", authMiddleware, requireTeacher, controller.updatePassword);
  return router;
}

module.exports = createTeacherSettingsPasswordRoutes;
