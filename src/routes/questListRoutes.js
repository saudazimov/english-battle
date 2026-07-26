const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createQuestListController,
} = require("../controllers/questListController");

function createQuestListRoutes({ getOrCreateDailyQuests }) {
  const router = express.Router();
  const controller = createQuestListController({ getOrCreateDailyQuests });
  router.post("/quests", authMiddleware, controller.list);
  return router;
}

module.exports = createQuestListRoutes;
