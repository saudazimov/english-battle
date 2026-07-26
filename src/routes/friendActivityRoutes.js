const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendActivityController } = require("../controllers/friendActivityController");

function createFriendActivityRoutes() {
  const router = express.Router();
  const controller = createFriendActivityController({ pool });
  router.get("/friends/activity/:userId", authMiddleware, controller.list);
  return router;
}

module.exports = createFriendActivityRoutes;
