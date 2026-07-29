const schoolBattleRankingsRoutes = require("./schoolBattleRankingsRoutes");
const combinedRankingsRoutes = require("./combinedRankingsRoutes");
const leaderboardRoutes = require("./leaderboardRoutes");

const defaultRouteFactories = {
  schoolBattle: schoolBattleRankingsRoutes,
  combined: combinedRankingsRoutes,
  leaderboard: leaderboardRoutes,
};

function registerRankingRoutes({
  app,
  pool,
  currentSeason,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.schoolBattle({ pool, currentSeason }));
  app.use(routeFactories.combined({ pool, currentSeason }));
  app.use(routeFactories.leaderboard({ pool }));
}

module.exports = registerRankingRoutes;
