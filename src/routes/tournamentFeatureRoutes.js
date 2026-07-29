const registerAdminTournamentRoutes = require("./adminTournamentRoutes");
const registerStudentTournamentRoutes = require("./studentTournamentRoutes");
const registerTournamentMatchRoutes = require("./tournamentMatchRoutes");

const defaultRoutes = {
  registerAdmin: registerAdminTournamentRoutes,
  registerStudent: registerStudentTournamentRoutes,
  registerMatch: registerTournamentMatchRoutes,
};

function registerAdminRoutes({
  app,
  pool,
  sanitizeText,
  seedOrder,
  propagateByes,
  routes = defaultRoutes,
}) {
  routes.registerAdmin({
    app,
    pool,
    sanitizeText,
    seedOrder,
    propagateByes,
  });
}

function registerStudentRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerStudent({ app, pool });
}

function registerMatchRoutes({
  app,
  pool,
  expireTournamentMatch,
  checkMatchCompletion,
  notifyMatchPlayers,
  routes = defaultRoutes,
}) {
  routes.registerMatch({
    app,
    pool,
    expireTournamentMatch,
    checkMatchCompletion,
    notifyMatchPlayers,
  });
}

module.exports = {
  registerAdminRoutes,
  registerStudentRoutes,
  registerMatchRoutes,
};
