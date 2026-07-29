const registerTeacherClassManagementRoutes = require(
  "./teacherClassManagementRoutes"
);
const {
  createStudentClassMembershipRoutes,
} = require("./studentClassMembershipRoutes");
const registerClassAnnouncementRoutes = require("./classAnnouncementRoutes");
const registerClassLearningRoutes = require("./classLearningRoutes");

const defaultRoutes = {
  registerTeacherManagement: registerTeacherClassManagementRoutes,
  createStudentMembership: createStudentClassMembershipRoutes,
  registerAnnouncements: registerClassAnnouncementRoutes,
  registerLearning: registerClassLearningRoutes,
};

function createClassFeatureRoutes({ routes = defaultRoutes } = {}) {
  let studentMembershipRoutes;

  return {
    registerTeacherManagementRoutes({ app, sanitizeText, logAudit }) {
      routes.registerTeacherManagement({ app, sanitizeText, logAudit });
    },
    initializeStudentMembershipRoutes(dependencies) {
      studentMembershipRoutes = routes.createStudentMembership(dependencies);
    },
    registerStudentEntryRoutes(app) {
      studentMembershipRoutes.registerEntryRoutes(app);
    },
    registerAnnouncementRoutes(dependencies) {
      routes.registerAnnouncements(dependencies);
    },
    registerStudentPostAnnouncementRoutes(app) {
      studentMembershipRoutes.registerPostAnnouncementRoutes(app);
    },
    registerLearningRoutes(dependencies) {
      routes.registerLearning(dependencies);
    },
  };
}

module.exports = { createClassFeatureRoutes };
