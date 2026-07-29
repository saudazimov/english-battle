const teacherWeeklyAiReportRoutes = require("./teacherWeeklyAiReportRoutes");
const teacherAiReportListRoutes = require("./teacherAiReportListRoutes");
const teacherAiReportDetailRoutes = require("./teacherAiReportDetailRoutes");

const defaultRouteFactories = {
  weekly: teacherWeeklyAiReportRoutes,
  list: teacherAiReportListRoutes,
  detail: teacherAiReportDetailRoutes,
};

function registerTeacherAiReportRoutes({
  app,
  pool,
  premium,
  aiSnapshot,
  aiService,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.weekly({ pool, premium, aiSnapshot, aiService }));
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.detail({ pool }));
}

module.exports = registerTeacherAiReportRoutes;
