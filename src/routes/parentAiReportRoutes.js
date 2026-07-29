const parentWeeklyAiReportRoutes = require("./parentWeeklyAiReportRoutes");
const parentAiReportListRoutes = require("./parentAiReportListRoutes");

const defaultRouteFactories = {
  weekly: parentWeeklyAiReportRoutes,
  list: parentAiReportListRoutes,
};

function registerParentAiReportRoutes({
  app,
  pool,
  premium,
  aiSnapshot,
  aiService,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.weekly({ pool, premium, aiSnapshot, aiService }));
  app.use(routeFactories.list({ pool, premium }));
}

module.exports = registerParentAiReportRoutes;
