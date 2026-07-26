const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendSearchController } = require("../controllers/friendSearchController");

function createFriendSearchRoutes() {
  const router = express.Router();
  const controller = createFriendSearchController({ pool });
  router.get("/friends/search", authMiddleware, controller.search);
  return router;
}

module.exports = createFriendSearchRoutes;
