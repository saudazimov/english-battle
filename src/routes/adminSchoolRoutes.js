const adminSchoolListRoutes = require("./adminSchoolListRoutes");
const adminSchoolStudentListRoutes = require("./adminSchoolStudentListRoutes");

const defaultRouteFactories = {
  schools: adminSchoolListRoutes,
  students: adminSchoolStudentListRoutes,
};

function registerAdminSchoolRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.schools({ pool }));
  app.use(routeFactories.students({ pool }));
}

module.exports = registerAdminSchoolRoutes;
