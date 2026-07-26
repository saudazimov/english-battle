const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendRespondController } = require("../controllers/friendRespondController");

function createFriendRespondRoutes({ createNotification, io, onlineUsers }) {
  const router = express.Router();
  const controller = createFriendRespondController({
    pool,
    createNotification,
    io,
    onlineUsers,
  });
  router.post("/friends/respond", authMiddleware, controller.respond);
  return router;
}

module.exports = createFriendRespondRoutes;
