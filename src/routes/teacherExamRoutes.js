const teacherExamCreateRoutes = require("./teacherExamCreateRoutes");
const teacherExamListRoutes = require("./teacherExamListRoutes");
const teacherExamDetailRoutes = require("./teacherExamDetailRoutes");
const teacherExamDeleteRoutes = require("./teacherExamDeleteRoutes");

const defaultRouteFactories = {
  create: teacherExamCreateRoutes,
  list: teacherExamListRoutes,
  detail: teacherExamDetailRoutes,
  remove: teacherExamDeleteRoutes,
};

function registerTeacherExamRoutes({
  app,
  pool,
  sanitizeText,
  logAudit,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.create({ pool, sanitizeText, logAudit }));
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.detail({ pool }));
  app.use(routeFactories.remove({ pool, logAudit }));
}

module.exports = registerTeacherExamRoutes;
