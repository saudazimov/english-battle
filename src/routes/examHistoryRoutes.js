const express = require("express");
const { authMiddleware } = require("../../auth");
const { createExamHistoryController } = require("../controllers/examHistoryController");

function examHistoryRoutes({ pool }) {
  const router = express.Router();
  const controller = createExamHistoryController({ pool });

  router.get("/exam/history/:userId", authMiddleware, controller.listAttempts);

  return router;
}

module.exports = examHistoryRoutes;
