const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendRequestsController } = require("../controllers/friendRequestsController");

function createFriendRequestsRoutes() {
  const router = express.Router();
  const controller = createFriendRequestsController({ pool });
  router.get("/friends/requests/:userId", authMiddleware, controller.list);
  return router;
}

module.exports = createFriendRequestsRoutes;
