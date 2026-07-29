const moderationFlagRoutes = require("./moderationFlagRoutes");
const adminFlagCountRoutes = require("./adminFlagCountRoutes");

const defaultRouteFactories = {
  flags: moderationFlagRoutes,
  count: adminFlagCountRoutes,
};

function registerModerationRoutes({
  app,
  pool,
  logAudit,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.flags({ pool, logAudit }));
  app.use(routeFactories.count());
}

module.exports = registerModerationRoutes;
