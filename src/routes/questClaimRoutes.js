const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createQuestClaimController,
} = require("../controllers/questClaimController");

function createQuestClaimRoutes({ pool }) {
  const router = express.Router();
  const controller = createQuestClaimController({ pool });
  router.post("/quests/claim", authMiddleware, controller.claim);
  return router;
}

module.exports = createQuestClaimRoutes;
