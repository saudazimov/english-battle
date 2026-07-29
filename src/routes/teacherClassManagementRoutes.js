const teacherClassCreateRoutes = require("./teacherClassCreateRoutes");
const teacherClassUpdateRoutes = require("./teacherClassUpdateRoutes");
const teacherClassArchiveRoutes = require("./teacherClassArchiveRoutes");
const teacherClassListRoutes = require("./teacherClassListRoutes");

const defaultRouteFactories = {
  create: teacherClassCreateRoutes,
  update: teacherClassUpdateRoutes,
  archive: teacherClassArchiveRoutes,
  list: teacherClassListRoutes,
};

function registerTeacherClassManagementRoutes({
  app,
  sanitizeText,
  logAudit,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.create({ sanitizeText, logAudit }));
  app.use(routeFactories.update({ sanitizeText, logAudit }));
  app.use(routeFactories.archive({ logAudit }));
  app.use(routeFactories.list());
}

module.exports = registerTeacherClassManagementRoutes;
