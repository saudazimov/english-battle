const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createFriendSuggestedController } = require("../controllers/friendSuggestedController");

function createFriendSuggestedRoutes() {
  const router = express.Router();
  const controller = createFriendSuggestedController({ pool });
  router.get("/friends/suggested/:userId", authMiddleware, controller.list);
  return router;
}

module.exports = createFriendSuggestedRoutes;
