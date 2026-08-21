const express = require("express");
const { authMiddleware } = require("../../auth");
const { createPracticeController } = require("../controllers/practiceController");
const {
  createSmartboardGameController,
} = require("../controllers/smartboardGameController");

function createPracticeRoutes(dependencies) {
  const controller = createPracticeController(dependencies);
  const smartboardController = createSmartboardGameController(dependencies);
  const sessionRouter = express.Router();

  sessionRouter.get("/practice/start", authMiddleware, controller.start);
  sessionRouter.post("/practice/answer", authMiddleware, controller.answer);
  sessionRouter.get(
    "/smartboard/questions",
    authMiddleware,
    smartboardController.questions
  );
  sessionRouter.get(
    "/smartboard/word-builder/words",
    authMiddleware,
    smartboardController.words
  );

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
