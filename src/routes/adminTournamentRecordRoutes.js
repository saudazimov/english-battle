const adminTournamentDetailRoutes = require("./adminTournamentDetailRoutes");
const adminTournamentEditRoutes = require("./adminTournamentEditRoutes");
const adminTournamentDeleteRoutes = require("./adminTournamentDeleteRoutes");

const defaultRouteFactories = {
  detail: adminTournamentDetailRoutes,
  edit: adminTournamentEditRoutes,
  remove: adminTournamentDeleteRoutes,
};

function registerAdminTournamentRecordRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.detail({ pool }));
  app.use(routeFactories.edit({ pool }));
  app.use(routeFactories.remove({ pool }));
}

module.exports = registerAdminTournamentRecordRoutes;
