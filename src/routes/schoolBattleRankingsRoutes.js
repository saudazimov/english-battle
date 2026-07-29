const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createSchoolBattleRankingsController,
} = require("../controllers/schoolBattleRankingsController");

function schoolBattleRankingsRoutes({ pool, currentSeason }) {
  const router = express.Router();
  const controller = createSchoolBattleRankingsController({ pool, currentSeason });

  router.get("/school-battle/rankings", authMiddleware, controller.rankings);
  router.get("/school-battle/my", authMiddleware, controller.mySchool);

  return router;
}

module.exports = schoolBattleRankingsRoutes;
