const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherConversationMessageSendController,
} = require("../controllers/teacherConversationMessageSendController");

function createTeacherConversationMessageSendRoutes({
  teacherStudentLinked,
  directMessageLimiter,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
}) {
  const router = express.Router();
  const controller = createTeacherConversationMessageSendController({
    pool,
    teacherStudentLinked,
    sanitizeText,
    filterProfanity,
    onlineUsers,
    io,
    createNotification,
  });
  router.post(
    "/teacher/conversations/:studentId/messages",
    authMiddleware,
    requireTeacher,
    directMessageLimiter,
    controller.send
  );
  return router;
}

module.exports = createTeacherConversationMessageSendRoutes;
