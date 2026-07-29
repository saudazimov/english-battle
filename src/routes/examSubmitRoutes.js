const express = require("express");
const { authMiddleware } = require("../../auth");
const { createExamSubmitController } = require("../controllers/examSubmitController");

function examSubmitRoutes({ pool, getNextLevel }) {
  const router = express.Router();
  const controller = createExamSubmitController({ pool, getNextLevel });

  router.post("/exam/submit", authMiddleware, controller.submitExam);

  return router;
}

module.exports = examSubmitRoutes;
