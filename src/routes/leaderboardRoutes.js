const express = require("express");
const { authMiddleware } = require("../../auth");
const { createLeaderboardController } = require("../controllers/leaderboardController");

function leaderboardRoutes({ pool }) {
  const router = express.Router();
  const controller = createLeaderboardController({ pool });

  router.get("/leaderboard", authMiddleware, controller.leaderboard);
  router.get("/leaderboard/my-ranks", authMiddleware, controller.myRanks);

  return router;
}

module.exports = leaderboardRoutes;
