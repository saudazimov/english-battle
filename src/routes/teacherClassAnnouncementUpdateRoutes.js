const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherClassAnnouncementUpdateController,
} = require("../controllers/teacherClassAnnouncementUpdateController");

function createTeacherClassAnnouncementUpdateRoutes({ sanitizeText, ownedActiveClass, io }) {
  const router = express.Router();
  const controller = createTeacherClassAnnouncementUpdateController({
    pool,
    sanitizeText,
    ownedActiveClass,
    io,
  });
  router.put(
    "/teacher/classes/:classId/announcements/:announcementId",
    authMiddleware,
    requireTeacher,
    controller.update
  );
  return router;
}

module.exports = createTeacherClassAnnouncementUpdateRoutes;
