const express = require("express");
const { authMiddleware, requireParent } = require("../../auth");
const {
  createParentWeeklyAiReportController,
} = require("../controllers/parentWeeklyAiReportController");

function parentWeeklyAiReportRoutes({ pool, premium, aiSnapshot, aiService }) {
  const router = express.Router();
  const controller = createParentWeeklyAiReportController({
    pool,
    aiSnapshot,
    aiService,
  });

  router.post(
    "/ai/reports/parent/children/:studentId/weekly",
    authMiddleware,
    requireParent,
    premium.requirePremium("parent"),
    controller.generate
  );

  return router;
}

module.exports = parentWeeklyAiReportRoutes;
