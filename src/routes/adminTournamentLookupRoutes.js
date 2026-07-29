const adminTournamentRegionsRoutes = require("./adminTournamentRegionsRoutes");
const adminTournamentDistrictSchoolsRoutes = require(
  "./adminTournamentDistrictSchoolsRoutes"
);

const defaultRouteFactories = {
  regions: adminTournamentRegionsRoutes,
  districtSchools: adminTournamentDistrictSchoolsRoutes,
};

function registerAdminTournamentLookupRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.regions());
  app.use(routeFactories.districtSchools({ pool }));
}

module.exports = registerAdminTournamentLookupRoutes;
