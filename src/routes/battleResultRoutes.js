const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createBattleResultController,
} = require("../controllers/battleResultController");

function createBattleResultRoutes({ pool }) {
  const router = express.Router();
  const controller = createBattleResultController({ pool });
  router.get("/battle/result/:roomId", authMiddleware, controller.getResult);
  return router;
}

module.exports = createBattleResultRoutes;
