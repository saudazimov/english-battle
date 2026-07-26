const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherClassAnnouncementCreateController,
} = require("../controllers/teacherClassAnnouncementCreateController");

function createTeacherClassAnnouncementCreateRoutes({ sanitizeText, ownedActiveClass, io }) {
  const router = express.Router();
  const controller = createTeacherClassAnnouncementCreateController({
    pool,
    sanitizeText,
    ownedActiveClass,
    io,
  });
  router.post(
    "/teacher/classes/:classId/announcements",
    authMiddleware,
    requireTeacher,
    controller.create
  );
  return router;
}

module.exports = createTeacherClassAnnouncementCreateRoutes;
