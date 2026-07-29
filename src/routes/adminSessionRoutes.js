const adminMeRoutes = require("./adminMeRoutes");
const adminLogoutRoutes = require("./adminLogoutRoutes");

const defaultRoutes = {
  me: adminMeRoutes,
  createLogout: adminLogoutRoutes,
};

function registerAdminSessionRoutes({
  app,
  pool,
  logAudit,
  routes = defaultRoutes,
}) {
  app.use(routes.me);
  app.use(routes.createLogout({ pool, logAudit }));
}

module.exports = registerAdminSessionRoutes;
