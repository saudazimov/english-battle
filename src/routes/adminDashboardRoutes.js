const adminAuditLogListRoutes = require("./adminAuditLogListRoutes");
const adminOverviewRoutes = require("./adminOverviewRoutes");

const defaultRouteFactories = {
  auditLogs: adminAuditLogListRoutes,
  overview: adminOverviewRoutes,
};

function registerAdminDashboardRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.auditLogs({ pool }));
  app.use(routeFactories.overview({ pool }));
}

module.exports = registerAdminDashboardRoutes;
