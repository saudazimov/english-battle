const registerAdminQuestionManagementRoutes = require("./adminQuestionManagementRoutes");
const registerAdminQuestionMonitoringRoutes = require("./adminQuestionMonitoringRoutes");
const createAdminQuestionBulkImportRoutes = require("./adminQuestionBulkImportRoutes");

const defaultRoutes = {
  registerManagement: registerAdminQuestionManagementRoutes,
  registerMonitoring: registerAdminQuestionMonitoringRoutes,
  createBulkImport: createAdminQuestionBulkImportRoutes,
};

function registerManagementRoutes({ app, pool, logAudit, routes = defaultRoutes }) {
  routes.registerManagement({ app, pool, logAudit });
}

function registerMonitoringRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerMonitoring({ app, pool });
}

function registerBulkImportRoutes({ app, pool, logAudit, routes = defaultRoutes }) {
  app.use(routes.createBulkImport({ pool, logAudit }));
}

module.exports = {
  registerManagementRoutes,
  registerMonitoringRoutes,
  registerBulkImportRoutes,
};
