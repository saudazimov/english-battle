const studentClassJoinRoutes = require("./studentClassJoinRoutes");
const {
  createStudentClassViewingRoutes,
} = require("./studentClassViewingRoutes");
const studentClassLeaveRoutes = require("./studentClassLeaveRoutes");

const defaultRouteFactories = {
  join: studentClassJoinRoutes,
  createViewing: createStudentClassViewingRoutes,
  leave: studentClassLeaveRoutes,
};

function createStudentClassMembershipRoutes({
  pool,
  premium,
  logAudit,
  io,
  activeClassMembership,
  routeFactories = defaultRouteFactories,
}) {
  let viewingRoutes;

  function registerEntryRoutes(app) {
    app.use(routeFactories.join({ pool, premium, logAudit, io }));
    viewingRoutes = routeFactories.createViewing({ pool, activeClassMembership });
    app.use(viewingRoutes.listRouter);
  }

  function registerPostAnnouncementRoutes(app) {
    app.use(routeFactories.leave({ pool, activeClassMembership, io }));
    app.use(viewingRoutes.rankingRouter);
  }

  return { registerEntryRoutes, registerPostAnnouncementRoutes };
}

module.exports = { createStudentClassMembershipRoutes };
