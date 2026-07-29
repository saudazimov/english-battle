const registerParentAiReportRoutes = require("./parentAiReportRoutes");
const studentWeeklyAiReportRoutes = require("./studentWeeklyAiReportRoutes");
const registerTeacherAiReportRoutes = require("./teacherAiReportRoutes");

const defaultRoutes = {
  registerParent: registerParentAiReportRoutes,
  createStudentWeekly: studentWeeklyAiReportRoutes,
  registerTeacher: registerTeacherAiReportRoutes,
};

function registerAiReportRoutes({
  app,
  pool,
  premium,
  aiSnapshot,
  aiService,
  routes = defaultRoutes,
}) {
  routes.registerParent({ app, pool, premium, aiSnapshot, aiService });
  app.use(routes.createStudentWeekly({ pool, premium, aiSnapshot, aiService }));
  routes.registerTeacher({ app, pool, premium, aiSnapshot, aiService });
}

module.exports = registerAiReportRoutes;
