const studentExamListRoutes = require("./studentExamListRoutes");
const studentExamStartRoutes = require("./studentExamStartRoutes");
const studentExamAttemptAnswerRoutes = require(
  "./studentExamAttemptAnswerRoutes"
);
const studentExamAttemptSubmitRoutes = require(
  "./studentExamAttemptSubmitRoutes"
);
const studentExamAttemptResultRoutes = require(
  "./studentExamAttemptResultRoutes"
);

const defaultRouteFactories = {
  list: studentExamListRoutes,
  start: studentExamStartRoutes,
  answer: studentExamAttemptAnswerRoutes,
  submit: studentExamAttemptSubmitRoutes,
  result: studentExamAttemptResultRoutes,
};

function registerStudentExamRoutes({
  app,
  pool,
  startGradeAttempt,
  submitGradeAttempt,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.start({ pool, gradeAttempt: startGradeAttempt }));
  app.use(routeFactories.answer({ pool }));
  app.use(routeFactories.submit({ pool, gradeAttempt: submitGradeAttempt }));
  app.use(routeFactories.result({ pool }));
}

module.exports = registerStudentExamRoutes;
