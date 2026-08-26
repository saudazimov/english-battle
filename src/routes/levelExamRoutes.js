const express = require("express");
const { authMiddleware } = require("../../auth");
const examStatusRoutes = require("./examStatusRoutes");
const examStartRoutes = require("./examStartRoutes");
const examSubmitRoutes = require("./examSubmitRoutes");
const examHistoryRoutes = require("./examHistoryRoutes");

const defaultRouteFactories = {
  status: examStatusRoutes,
  start: examStartRoutes,
  submit: examSubmitRoutes,
  history: examHistoryRoutes,
};

function levelExamRetired(_req, res) {
  return res.status(410).json({
    error: "Daraja imtihoni bekor qilingan. CEFR darajasi RP reytingi orqali avtomatik o'zgaradi.",
    code: "LEVEL_EXAM_RETIRED",
  });
}

function createRetiredLevelExamRouter() {
  const router = express.Router();

  router.get("/exam/status/:userId", authMiddleware, levelExamRetired);
  router.get("/exam/start/:userId", authMiddleware, levelExamRetired);
  router.post("/exam/submit", authMiddleware, levelExamRetired);
  router.get("/exam/history/:userId", authMiddleware, levelExamRetired);

  return router;
}

function registerLevelExamRoutes({
  app,
  pool,
  getNextLevel,
  randomUUID,
  routeFactories = defaultRouteFactories,
  enabled = false,
}) {
  if (!enabled) {
    app.use(createRetiredLevelExamRouter());
    return;
  }

  app.use(routeFactories.status({ pool, getNextLevel }));
  app.use(routeFactories.start({ pool, randomUUID }));
  app.use(routeFactories.submit({ pool, getNextLevel }));
  app.use(routeFactories.history({ pool }));
}

module.exports = registerLevelExamRoutes;
module.exports.createRetiredLevelExamRouter = createRetiredLevelExamRouter;
