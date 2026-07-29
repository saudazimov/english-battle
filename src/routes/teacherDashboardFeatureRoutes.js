const teacherDashboardRoutes = require("./teacherDashboardRoutes");
const teacherOverviewRoutes = require("./teacherOverviewRoutes");

const defaultRouteFactories = {
  dashboard: teacherDashboardRoutes,
  overview: teacherOverviewRoutes,
};

function registerTeacherDashboardFeatureRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.dashboard());
  app.use(routeFactories.overview({ pool }));
}

module.exports = registerTeacherDashboardFeatureRoutes;
