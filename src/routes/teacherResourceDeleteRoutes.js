const express = require("express");
const fs = require("fs");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherResourceDeleteController,
} = require("../controllers/teacherResourceDeleteController");

function createTeacherResourceDeleteRoutes({ resourceAbsolutePath, logAudit }) {
  const router = express.Router();
  const controller = createTeacherResourceDeleteController({
    pool,
    fileSystem: fs,
    resourceAbsolutePath,
    logAudit,
  });
  router.delete("/teacher/resources/:id", authMiddleware, requireTeacher, controller.remove);
  return router;
}

module.exports = createTeacherResourceDeleteRoutes;
