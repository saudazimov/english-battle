const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendWinsController } = require("../controllers/friendWinsController");

function createFriendWinsRoutes() {
  const router = express.Router();
  const controller = createFriendWinsController({ pool });
  router.get("/friends/wins/:userId", authMiddleware, controller.getWins);
  return router;
}

module.exports = createFriendWinsRoutes;
