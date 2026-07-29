const schoolInviteVerificationRoutes = require(
  "./schoolInviteVerificationRoutes"
);
const adminSchoolInviteCreationRoutes = require(
  "./adminSchoolInviteCreationRoutes"
);

const defaultRouteFactories = {
  verification: schoolInviteVerificationRoutes,
  creation: adminSchoolInviteCreationRoutes,
};

function registerSchoolInviteRoutes({
  app,
  pool,
  schoolInvite,
  schoolCodeLookupLimiter,
  routeFactories = defaultRouteFactories,
}) {
  app.use(
    routeFactories.verification({
      pool,
      schoolInvite,
      schoolCodeLookupLimiter,
    })
  );
  app.use(routeFactories.creation({ pool }));
}

module.exports = registerSchoolInviteRoutes;
