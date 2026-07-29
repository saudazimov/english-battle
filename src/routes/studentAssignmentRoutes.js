const studentAssignmentListRoutes = require("./studentAssignmentListRoutes");
const studentAssignmentStartRoutes = require("./studentAssignmentStartRoutes");
const studentAssignmentSubmitRoutes = require("./studentAssignmentSubmitRoutes");
const studentAssignmentReviewRoutes = require("./studentAssignmentReviewRoutes");

const defaultRouteFactories = {
  list: studentAssignmentListRoutes,
  start: studentAssignmentStartRoutes,
  submit: studentAssignmentSubmitRoutes,
  review: studentAssignmentReviewRoutes,
};

function registerStudentAssignmentRoutes({
  app,
  pool,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.list({ pool }));
  app.use(routeFactories.start({ pool }));
  app.use(routeFactories.submit({ pool }));
  app.use(routeFactories.review({ pool }));
}

module.exports = registerStudentAssignmentRoutes;
