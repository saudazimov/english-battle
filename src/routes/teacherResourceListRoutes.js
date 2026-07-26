const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherResourceListController,
} = require("../controllers/teacherResourceListController");

function createTeacherResourceListRoutes() {
  const router = express.Router();
  const controller = createTeacherResourceListController({ pool });
  router.get("/teacher/resources", authMiddleware, requireTeacher, controller.list);
  return router;
}

module.exports = createTeacherResourceListRoutes;
