const teacherAssignmentListRoutes = require("./teacherAssignmentListRoutes");
const teacherResultsAnalyticsRoutes = require("./teacherResultsAnalyticsRoutes");

const defaultRouteFactories = {
  list: teacherAssignmentListRoutes,
  results: teacherResultsAnalyticsRoutes,
};

function registerTeacherAssignmentOverviewRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.results({ pool }));
}

module.exports = registerTeacherAssignmentOverviewRoutes;
