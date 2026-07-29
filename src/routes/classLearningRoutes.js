const classAttendanceRoutes = require("./classAttendanceRoutes");
const classLessonRoutes = require("./classLessonRoutes");

const defaultRouteFactories = {
  attendance: classAttendanceRoutes,
  lessons: classLessonRoutes,
};

function registerClassLearningRoutes({
  app,
  pool,
  sanitizeText,
  validMeetingUrl,
  ownedActiveClass,
  activeClassMembership,
  io,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.attendance({
    pool,
    sanitizeText,
    ownedActiveClass,
    activeClassMembership,
    io,
  }));
  app.use(routeFactories.lessons({
    pool,
    sanitizeText,
    validMeetingUrl,
    ownedActiveClass,
    activeClassMembership,
    io,
  }));
}

module.exports = registerClassLearningRoutes;
