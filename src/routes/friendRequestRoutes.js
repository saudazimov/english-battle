const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendRequestController } = require("../controllers/friendRequestController");

function createFriendRequestRoutes({ createNotification, io, onlineUsers }) {
  const router = express.Router();
  const controller = createFriendRequestController({
    pool,
    createNotification,
    io,
    onlineUsers,
  });
  router.post("/friends/request", authMiddleware, controller.send);
  return router;
}

module.exports = createFriendRequestRoutes;
