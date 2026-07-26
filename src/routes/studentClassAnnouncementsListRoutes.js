const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentClassAnnouncementsListController,
} = require("../controllers/studentClassAnnouncementsListController");

function createStudentClassAnnouncementsListRoutes({ activeClassMembership }) {
  const router = express.Router();
  const controller = createStudentClassAnnouncementsListController({ pool, activeClassMembership });
  router.get(
    "/student/classes/:classId/announcements",
    authMiddleware,
    requireStudent,
    controller.list
  );
  return router;
}

module.exports = createStudentClassAnnouncementsListRoutes;
