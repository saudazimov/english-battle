const registerLevelExamRoutes = require("./levelExamRoutes");
const registerTeacherExamRoutes = require("./teacherExamRoutes");
const registerStudentExamRoutes = require("./studentExamRoutes");

const defaultRoutes = {
  registerLevel: registerLevelExamRoutes,
  registerTeacher: registerTeacherExamRoutes,
  registerStudent: registerStudentExamRoutes,
};

function registerLevelRoutes({
  app,
  pool,
  getNextLevel,
  randomUUID,
  routes = defaultRoutes,
}) {
  routes.registerLevel({ app, pool, getNextLevel, randomUUID });
}

function registerTeacherRoutes({
  app,
  pool,
  sanitizeText,
  logAudit,
  routes = defaultRoutes,
}) {
  routes.registerTeacher({ app, pool, sanitizeText, logAudit });
}

function registerStudentRoutes({
  app,
  pool,
  startGradeAttempt,
  submitGradeAttempt,
  routes = defaultRoutes,
}) {
  routes.registerStudent({
    app,
    pool,
    startGradeAttempt,
    submitGradeAttempt,
  });
}

module.exports = {
  registerLevelRoutes,
  registerTeacherRoutes,
  registerStudentRoutes,
};
