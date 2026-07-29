const express = require("express");
const { authMiddleware } = require("../../auth");
const { createPracticeController } = require("../controllers/practiceController");

function createPracticeRoutes(dependencies) {
  const controller = createPracticeController(dependencies);
  const sessionRouter = express.Router();

  sessionRouter.get("/practice/start", authMiddleware, controller.start);
  sessionRouter.post("/practice/answer", authMiddleware, controller.answer);

  return {
    sessionRouter,
    createFinishRouter(practiceFinishLimiter) {
      const finishRouter = express.Router();
      finishRouter.post(
        "/practice/finish",
        authMiddleware,
        practiceFinishLimiter,
        controller.finish
      );
      return finishRouter;
    },
  };
}

module.exports = { createPracticeRoutes };
