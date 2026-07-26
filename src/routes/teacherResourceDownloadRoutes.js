const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherResourceDownloadController,
} = require("../controllers/teacherResourceDownloadController");

function createTeacherResourceDownloadRoutes({ resourceAbsolutePath }) {
  const router = express.Router();
  const controller = createTeacherResourceDownloadController({ pool, resourceAbsolutePath });
  router.get(
    "/teacher/resources/:id/download",
    authMiddleware,
    requireTeacher,
    controller.download
  );
  return router;
}

module.exports = createTeacherResourceDownloadRoutes;
