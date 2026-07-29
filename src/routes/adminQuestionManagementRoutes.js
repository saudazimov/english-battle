const adminQuestionListRoutes = require("./adminQuestionListRoutes");
const adminQuestionCreateRoutes = require("./adminQuestionCreateRoutes");
const adminQuestionDeleteRoutes = require("./adminQuestionDeleteRoutes");
const adminQuestionUpdateRoutes = require("./adminQuestionUpdateRoutes");

const defaultRouteFactories = {
  list: adminQuestionListRoutes,
  create: adminQuestionCreateRoutes,
  remove: adminQuestionDeleteRoutes,
  update: adminQuestionUpdateRoutes,
};

function registerAdminQuestionManagementRoutes({
  app,
  pool,
  logAudit,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.create({ pool, logAudit }));
  app.use(routeFactories.remove({ pool, logAudit }));
  app.use(routeFactories.update({ pool, logAudit }));
}

module.exports = registerAdminQuestionManagementRoutes;
