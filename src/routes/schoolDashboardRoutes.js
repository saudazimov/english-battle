const schoolProfileRoutes = require("./schoolProfileRoutes");
const schoolOverviewRoutes = require("./schoolOverviewRoutes");

const defaultRouteFactories = {
  profile: schoolProfileRoutes,
  overview: schoolOverviewRoutes,
};

function registerSchoolDashboardRoutes({
  app,
  pool,
  getSchoolAdmin,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.profile({ pool, getSchoolAdmin }));
  app.use(routeFactories.overview({ getSchoolAdmin }));
}

module.exports = registerSchoolDashboardRoutes;
