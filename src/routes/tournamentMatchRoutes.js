const tournamentMatchCheckinStateRoutes = require("./tournamentMatchCheckinStateRoutes");
const tournamentMatchPlayerCheckinRoutes = require("./tournamentMatchPlayerCheckinRoutes");
const tournamentMatchBattleStateRoutes = require("./tournamentMatchBattleStateRoutes");
const tournamentMatchAnswerRoutes = require("./tournamentMatchAnswerRoutes");
const tournamentMatchFinishRoutes = require("./tournamentMatchFinishRoutes");

const defaultRouteFactories = {
  checkinState: tournamentMatchCheckinStateRoutes,
  playerCheckin: tournamentMatchPlayerCheckinRoutes,
  battleState: tournamentMatchBattleStateRoutes,
  answer: tournamentMatchAnswerRoutes,
  finish: tournamentMatchFinishRoutes,
};

function registerTournamentMatchRoutes({
  app,
  pool,
  notifyMatchPlayers,
  expireTournamentMatch,
  checkMatchCompletion,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.checkinState({ pool }));
  app.use(routeFactories.playerCheckin({ pool, notifyMatchPlayers }));
  app.use(routeFactories.battleState({ pool }));
  app.use(routeFactories.answer({ pool, expireTournamentMatch, notifyMatchPlayers }));
  app.use(routeFactories.finish({ pool, expireTournamentMatch, checkMatchCompletion }));
}

module.exports = registerTournamentMatchRoutes;
