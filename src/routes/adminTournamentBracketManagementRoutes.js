const adminTournamentBracketGenerationRoutes = require(
  "./adminTournamentBracketGenerationRoutes"
);
const adminTournamentBracketRoutes = require("./adminTournamentBracketRoutes");

const defaultRouteFactories = {
  generation: adminTournamentBracketGenerationRoutes,
  bracket: adminTournamentBracketRoutes,
};

function registerAdminTournamentBracketManagementRoutes({
  app,
  pool,
  seedOrder,
  propagateByes,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.generation({ pool, seedOrder, propagateByes }));
  app.use(routeFactories.bracket({ pool }));
}

module.exports = registerAdminTournamentBracketManagementRoutes;
