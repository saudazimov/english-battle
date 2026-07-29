const express = require("express");
const { authMiddleware } = require("../../auth");
const { createCombinedRankingsController } = require("../controllers/combinedRankingsController");

function combinedRankingsRoutes({ pool, currentSeason }) {
  const router = express.Router();
  const controller = createCombinedRankingsController({ pool, currentSeason });
  router.get("/rankings/combined", authMiddleware, controller.rankings);
  return router;
}

module.exports = combinedRankingsRoutes;
