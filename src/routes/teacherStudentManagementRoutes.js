const teacherStudentRosterRoutes = require("./teacherStudentRosterRoutes");
const teacherStudentRemovalRoutes = require("./teacherStudentRemovalRoutes");

const defaultRouteFactories = {
  roster: teacherStudentRosterRoutes,
  removal: teacherStudentRemovalRoutes,
};

function registerTeacherStudentManagementRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.roster({ pool }));
  app.use(routeFactories.removal({ pool }));
}

module.exports = registerTeacherStudentManagementRoutes;
