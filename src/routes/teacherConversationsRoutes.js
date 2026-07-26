const express = require("express");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherConversationsController,
} = require("../controllers/teacherConversationsController");

function createTeacherConversationsRoutes({ onlineUsers }) {
  const router = express.Router();
  const controller = createTeacherConversationsController({ pool, onlineUsers });
  router.get("/teacher/conversations", authMiddleware, requireTeacher, controller.list);
  return router;
}

module.exports = createTeacherConversationsRoutes;
