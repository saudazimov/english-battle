const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendRemoveController } = require("../controllers/friendRemoveController");

function createFriendRemoveRoutes({ io, onlineUsers }) {
  const router = express.Router();
  const controller = createFriendRemoveController({ pool, io, onlineUsers });
  router.post("/friends/remove", authMiddleware, controller.remove);
  return router;
}

module.exports = createFriendRemoveRoutes;
