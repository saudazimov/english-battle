const teacherClassAssignmentListRoutes = require("./teacherClassAssignmentListRoutes");
const teacherAssignmentArchiveRoutes = require("./teacherAssignmentArchiveRoutes");
const teacherAssignmentResultsRoutes = require("./teacherAssignmentResultsRoutes");

const defaultRouteFactories = {
  classList: teacherClassAssignmentListRoutes,
  archive: teacherAssignmentArchiveRoutes,
  results: teacherAssignmentResultsRoutes,
};

function registerTeacherAssignmentManagementRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.classList({ pool }));
  app.use(routeFactories.archive({ pool }));
  app.use(routeFactories.results({ pool }));
}

module.exports = registerTeacherAssignmentManagementRoutes;
