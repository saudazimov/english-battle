const adminAnalyticsReportRoutes = require("./adminAnalyticsReportRoutes");
const registerAdminDashboardRoutes = require("./adminDashboardRoutes");

const defaultRoutes = {
  createAnalytics: adminAnalyticsReportRoutes,
  registerDashboard: registerAdminDashboardRoutes,
};

function createAdminInsightsRoutes({ pool, routes = defaultRoutes }) {
  function registerAnalyticsRoutes(app) {
    app.use(routes.createAnalytics({ pool }));
  }

  function registerDashboardRoutes(app) {
    routes.registerDashboard({ app, pool });
  }

  return { registerAnalyticsRoutes, registerDashboardRoutes };
}

module.exports = { createAdminInsightsRoutes };
