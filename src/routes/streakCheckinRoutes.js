const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createStreakCheckinController,
} = require("../controllers/streakCheckinController");

function createStreakCheckinRoutes({ pool }) {
  const router = express.Router();
  const controller = createStreakCheckinController({ pool });
  router.post("/streak/checkin", authMiddleware, controller.checkin);
  return router;
}

module.exports = createStreakCheckinRoutes;
