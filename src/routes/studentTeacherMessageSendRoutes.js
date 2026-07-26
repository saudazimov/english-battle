const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentTeacherMessageSendController,
} = require("../controllers/studentTeacherMessageSendController");

function createStudentTeacherMessageSendRoutes({
  teacherStudentLinked,
  directMessageLimiter,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
}) {
  const router = express.Router();
  const controller = createStudentTeacherMessageSendController({
    pool,
    teacherStudentLinked,
    sanitizeText,
    filterProfanity,
    onlineUsers,
    io,
    createNotification,
  });
  router.post(
    "/student/teachers/:teacherId/messages",
    authMiddleware,
    requireStudent,
    directMessageLimiter,
    controller.send
  );
  return router;
}

module.exports = createStudentTeacherMessageSendRoutes;
