const registerStudentAssignmentRoutes = require("./studentAssignmentRoutes");
const teacherAssignmentRoutes = require("./teacherAssignmentRoutes");

const defaultRoutes = {
  registerTeacherOverview: teacherAssignmentRoutes.registerOverviewRoutes,
  registerStudent: registerStudentAssignmentRoutes,
  registerTeacherCreate: teacherAssignmentRoutes.registerCreateRoutes,
  registerTeacherManagement: teacherAssignmentRoutes.registerManagementRoutes,
};

function registerTeacherOverviewRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerTeacherOverview({ app, pool });
}

function registerStudentRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerStudent({ app, pool });
}

function registerTeacherCreateRoutes({
  app,
  pool,
  premium,
  logAudit,
  sanitizeText,
  routes = defaultRoutes,
}) {
  routes.registerTeacherCreate({
    app,
    pool,
    premium,
    logAudit,
    sanitizeText,
  });
}

function registerTeacherManagementRoutes({ app, pool, routes = defaultRoutes }) {
  routes.registerTeacherManagement({ app, pool });
}

module.exports = {
  registerTeacherOverviewRoutes,
  registerStudentRoutes,
  registerTeacherCreateRoutes,
  registerTeacherManagementRoutes,
};
