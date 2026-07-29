const registerAdminTournamentLookupRoutes = require("./adminTournamentLookupRoutes");
const registerAdminTournamentCatalogRoutes = require("./adminTournamentCatalogRoutes");
const registerAdminTournamentBracketManagementRoutes = require(
  "./adminTournamentBracketManagementRoutes"
);
const registerAdminTournamentRecordRoutes = require("./adminTournamentRecordRoutes");

const defaultRoutes = {
  registerLookup: registerAdminTournamentLookupRoutes,
  registerCatalog: registerAdminTournamentCatalogRoutes,
  registerBracketManagement: registerAdminTournamentBracketManagementRoutes,
  registerRecord: registerAdminTournamentRecordRoutes,
};

function registerAdminTournamentRoutes({
  app,
  pool,
  sanitizeText,
  seedOrder,
  propagateByes,
  routes = defaultRoutes,
}) {
  routes.registerLookup({ app, pool });
  routes.registerCatalog({ app, pool, sanitizeText });
  routes.registerBracketManagement({ app, pool, seedOrder, propagateByes });
  routes.registerRecord({ app, pool });
}

module.exports = registerAdminTournamentRoutes;
