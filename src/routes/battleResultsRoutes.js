const battleHistoryListRoutes = require("./battleHistoryListRoutes");
const battleResultRoutes = require("./battleResultRoutes");
const teamBattleResultRoutes = require("./teamBattleResultRoutes");

const defaultRouteFactories = {
  history: battleHistoryListRoutes,
  battleResult: battleResultRoutes,
  teamBattleResult: teamBattleResultRoutes,
};

function registerBattleResultsRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.history({ pool }));
  app.use(routeFactories.battleResult({ pool }));
  app.use(routeFactories.teamBattleResult({ pool }));
}

module.exports = registerBattleResultsRoutes;
