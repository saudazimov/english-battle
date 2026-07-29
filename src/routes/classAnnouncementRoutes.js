const teacherClassAnnouncementsListRoutes = require(
  "./teacherClassAnnouncementsListRoutes"
);
const teacherClassAnnouncementCreateRoutes = require(
  "./teacherClassAnnouncementCreateRoutes"
);
const teacherClassAnnouncementUpdateRoutes = require(
  "./teacherClassAnnouncementUpdateRoutes"
);
const teacherClassAnnouncementDeleteRoutes = require(
  "./teacherClassAnnouncementDeleteRoutes"
);
const studentClassAnnouncementsListRoutes = require(
  "./studentClassAnnouncementsListRoutes"
);

const defaultRouteFactories = {
  teacherList: teacherClassAnnouncementsListRoutes,
  create: teacherClassAnnouncementCreateRoutes,
  update: teacherClassAnnouncementUpdateRoutes,
  remove: teacherClassAnnouncementDeleteRoutes,
  studentList: studentClassAnnouncementsListRoutes,
};

function registerClassAnnouncementRoutes({
  app,
  sanitizeText,
  ownedActiveClass,
  activeClassMembership,
  io,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.teacherList({ ownedActiveClass }));
  app.use(routeFactories.create({ sanitizeText, ownedActiveClass, io }));
  app.use(routeFactories.update({ sanitizeText, ownedActiveClass, io }));
  app.use(routeFactories.remove({ ownedActiveClass, io }));
  app.use(routeFactories.studentList({ activeClassMembership }));
}

module.exports = registerClassAnnouncementRoutes;
