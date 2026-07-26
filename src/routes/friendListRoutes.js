const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendListController } = require("../controllers/friendListController");

function createFriendListRoutes({ onlineUsers }) {
  const router = express.Router();
  const controller = createFriendListController({ pool, onlineUsers });
  router.get("/friends/:userId", authMiddleware, controller.list);
  return router;
}

module.exports = createFriendListRoutes;
