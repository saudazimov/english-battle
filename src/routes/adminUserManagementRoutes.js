const adminUserListRoutes = require("./adminUserListRoutes");
const adminUserRoleRoutes = require("./adminUserRoleRoutes");
const adminUserBanRoutes = require("./adminUserBanRoutes");
const adminUserUpdateRoutes = require("./adminUserUpdateRoutes");
const adminUserDetailRoutes = require("./adminUserDetailRoutes");

const defaultRouteFactories = {
  list: adminUserListRoutes,
  role: adminUserRoleRoutes,
  ban: adminUserBanRoutes,
  update: adminUserUpdateRoutes,
  detail: adminUserDetailRoutes,
};

function registerAdminUserManagementRoutes({
  app,
  pool,
  logAudit,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.role({ pool, logAudit }));
  app.use(routeFactories.ban({ pool, logAudit }));
  app.use(routeFactories.update({ pool, logAudit }));
  app.use(routeFactories.detail({ pool }));
}

module.exports = registerAdminUserManagementRoutes;
