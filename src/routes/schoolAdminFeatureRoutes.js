const registerSchoolDashboardRoutes = require("./schoolDashboardRoutes");
const registerSchoolTournamentManagementRoutes = require(
  "./schoolTournamentManagementRoutes"
);

const defaultRoutes = {
  registerDashboard: registerSchoolDashboardRoutes,
  registerTournamentManagement: registerSchoolTournamentManagementRoutes,
};

function registerSchoolAdminFeatureRoutes({
  app,
  pool,
  getSchoolAdmin,
  routes = defaultRoutes,
}) {
  routes.registerDashboard({ app, pool, getSchoolAdmin });
  routes.registerTournamentManagement({ app, getSchoolAdmin });
}

module.exports = registerSchoolAdminFeatureRoutes;
