const adminTournamentCreateRoutes = require("./adminTournamentCreateRoutes");
const adminTournamentListRoutes = require("./adminTournamentListRoutes");

const defaultRouteFactories = {
  create: adminTournamentCreateRoutes,
  list: adminTournamentListRoutes,
};

function registerAdminTournamentCatalogRoutes({
  app,
  pool,
  sanitizeText,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.create({ pool, sanitizeText }));
  app.use(routeFactories.list({ pool }));
}

module.exports = registerAdminTournamentCatalogRoutes;
