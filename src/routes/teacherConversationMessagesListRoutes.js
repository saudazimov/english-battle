const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherConversationMessagesListController,
} = require("../controllers/teacherConversationMessagesListController");

function createTeacherConversationMessagesListRoutes({ teacherStudentLinked }) {
  const router = express.Router();
  const controller = createTeacherConversationMessagesListController({
    pool,
    teacherStudentLinked,
  });
  router.get(
    "/teacher/conversations/:studentId/messages",
    authMiddleware,
    requireTeacher,
    controller.list
  );
  return router;
}

module.exports = createTeacherConversationMessagesListRoutes;
