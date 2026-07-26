const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherClassAnnouncementDeleteController,
} = require("../controllers/teacherClassAnnouncementDeleteController");

function createTeacherClassAnnouncementDeleteRoutes({ ownedActiveClass, io }) {
  const router = express.Router();
  const controller = createTeacherClassAnnouncementDeleteController({ pool, ownedActiveClass, io });
  router.delete(
    "/teacher/classes/:classId/announcements/:announcementId",
    authMiddleware,
    requireTeacher,
    controller.remove
  );
  return router;
}

module.exports = createTeacherClassAnnouncementDeleteRoutes;
