const express = require("express");
const { authMiddleware } = require("../../auth");
const { createExamStartController } = require("../controllers/examStartController");

function examStartRoutes({ pool, randomUUID }) {
  const router = express.Router();
  const controller = createExamStartController({ pool, randomUUID });

  router.get("/exam/start/:userId", authMiddleware, controller.startExam);

  return router;
}

module.exports = examStartRoutes;
