const express = require("express");
const { authMiddleware, requireParent } = require("../../auth");
const {
  createParentAiReportListController,
} = require("../controllers/parentAiReportListController");

function createParentAiReportListRoutes({ pool, premium }) {
  const router = express.Router();
  const controller = createParentAiReportListController({ pool });
  router.get(
    "/ai/reports/parent/children/:studentId",
    authMiddleware,
    requireParent,
    premium.requirePremium("parent"),
    controller.list
  );
  return router;
}

module.exports = createParentAiReportListRoutes;
