const teacherResourceUploadRoutes = require("./teacherResourceUploadRoutes");
const teacherResourceListRoutes = require("./teacherResourceListRoutes");
const teacherResourceDownloadRoutes = require("./teacherResourceDownloadRoutes");
const teacherResourceDeleteRoutes = require("./teacherResourceDeleteRoutes");

const defaultRouteFactories = {
  upload: teacherResourceUploadRoutes,
  list: teacherResourceListRoutes,
  download: teacherResourceDownloadRoutes,
  remove: teacherResourceDeleteRoutes,
};

function registerTeacherResourceRoutes({
  app,
  uploadResource,
  uploadedContentMatches,
  removeUploadedFile,
  sanitizeText,
  detectFileType,
  logAudit,
  resourceAbsolutePath,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.upload({
    uploadResource,
    uploadedContentMatches,
    removeUploadedFile,
    sanitizeText,
    detectFileType,
    logAudit,
  }));
  app.use(routeFactories.list());
  app.use(routeFactories.download({ resourceAbsolutePath }));
  app.use(routeFactories.remove({ resourceAbsolutePath, logAudit }));
}

module.exports = registerTeacherResourceRoutes;
