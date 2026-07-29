const registerTeacherAssignmentOverviewRoutes = require(
  "./teacherAssignmentOverviewRoutes"
);
const createTeacherAssignmentRoutes = require("./teacherAssignmentCreateRoutes");
const registerTeacherAssignmentManagementRoutes = require(
  "./teacherAssignmentManagementRoutes"
);

const defaultRoutes = {
  registerOverview: registerTeacherAssignmentOverviewRoutes,
  createAssignment: createTeacherAssignmentRoutes,
  registerManagement: registerTeacherAssignmentManagementRoutes,
};

function registerOverviewRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerOverview({ app, pool });
}

function registerCreateRoutes({
  app,
  pool,
  premium,
  logAudit,
  sanitizeText,
  routes = defaultRoutes,
}) {
  app.use(routes.createAssignment({ pool, premium, logAudit, sanitizeText }));
}

function registerManagementRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerManagement({ app, pool });
}

module.exports = {
  registerOverviewRoutes,
  registerCreateRoutes,
  registerManagementRoutes,
};
