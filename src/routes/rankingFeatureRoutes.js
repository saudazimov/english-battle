const registerRankingRoutes = require("./rankingRoutes");
const registerGeographicRankingRoutes = require("./geographicRankingRoutes");

const defaultRoutes = {
  registerGeneral: registerRankingRoutes,
  registerGeographic: registerGeographicRankingRoutes,
};

function registerGeneralRoutes({
  app,
  pool,
  currentSeason,
  routes = defaultRoutes,
}) {
  routes.registerGeneral({ app, pool, currentSeason });
}

function registerGeographicRoutes({ app, routes = defaultRoutes }) {
  routes.registerGeographic({ app });
}

module.exports = {
  registerGeneralRoutes,
  registerGeographicRoutes,
};
