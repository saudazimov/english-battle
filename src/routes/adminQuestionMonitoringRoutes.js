const adminQuestionStatsRoutes = require("./adminQuestionStatsRoutes");
const adminQuestionHealthRoutes = require("./adminQuestionHealthRoutes");

const defaultRouteFactories = {
  stats: adminQuestionStatsRoutes,
  health: adminQuestionHealthRoutes,
};

function registerAdminQuestionMonitoringRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.stats({ pool }));
  app.use(routeFactories.health({ pool }));
}

module.exports = registerAdminQuestionMonitoringRoutes;
