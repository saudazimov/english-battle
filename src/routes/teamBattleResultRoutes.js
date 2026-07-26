const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createTeamBattleResultController,
} = require("../controllers/teamBattleResultController");

function createTeamBattleResultRoutes({ pool }) {
  const router = express.Router();
  const controller = createTeamBattleResultController({ pool });
  router.get("/team-battle/result/:roomId", authMiddleware, controller.getResult);
  return router;
}

module.exports = createTeamBattleResultRoutes;
