const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherClassAnnouncementsListController,
} = require("../controllers/teacherClassAnnouncementsListController");

function createTeacherClassAnnouncementsListRoutes({ ownedActiveClass }) {
  const router = express.Router();
  const controller = createTeacherClassAnnouncementsListController({ pool, ownedActiveClass });
  router.get(
    "/teacher/classes/:classId/announcements",
    authMiddleware,
    requireTeacher,
    controller.list
  );
  return router;
}

module.exports = createTeacherClassAnnouncementsListRoutes;
