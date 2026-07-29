const express = require("express");
const { authMiddleware } = require("../../auth");
const { createExamStatusController } = require("../controllers/examStatusController");

function examStatusRoutes({ pool, getNextLevel }) {
  const router = express.Router();
  const controller = createExamStatusController({ pool, getNextLevel });

  router.get("/exam/status/:userId", authMiddleware, controller.getStatus);

  return router;
}

module.exports = examStatusRoutes;
