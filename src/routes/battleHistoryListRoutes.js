const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createBattleHistoryListController,
} = require("../controllers/battleHistoryListController");

function createBattleHistoryListRoutes({ pool }) {
  const router = express.Router();
  const controller = createBattleHistoryListController({ pool });
  router.get("/history/:userId", authMiddleware, controller.list);
  return router;
}

module.exports = createBattleHistoryListRoutes;
