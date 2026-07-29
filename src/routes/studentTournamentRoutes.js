const studentTournamentListRoutes = require("./studentTournamentListRoutes");
const studentTournamentBracketRoutes = require("./studentTournamentBracketRoutes");

const defaultRouteFactories = {
  list: studentTournamentListRoutes,
  bracket: studentTournamentBracketRoutes,
};

function registerStudentTournamentRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.bracket({ pool }));
}

module.exports = registerStudentTournamentRoutes;
