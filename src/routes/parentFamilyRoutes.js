const parentLinkRoutes = require("./parentLinkRoutes");
const parentChildrenListRoutes = require("./parentChildrenListRoutes");
const parentChildDetailRoutes = require("./parentChildDetailRoutes");
const parentChildUnlinkRoutes = require("./parentChildUnlinkRoutes");

const defaultRouteFactories = {
  link: parentLinkRoutes,
  childrenList: parentChildrenListRoutes,
  childDetail: parentChildDetailRoutes,
  childUnlink: parentChildUnlinkRoutes,
};

function registerParentFamilyRoutes({
  app,
  pool,
  parentCode,
  parentLinkBlocked,
  parentLinkNoteFail,
  parentLinkNoteOk,
  parentLeagueName,
  activityLabel,
  routeFactories = defaultRouteFactories,
}) {
  app.use(
    routeFactories.link({
      pool,
      parentCode,
      parentLinkBlocked,
      parentLinkNoteFail,
      parentLinkNoteOk,
    })
  );
  app.use(routeFactories.childrenList({ pool, parentLeagueName, activityLabel }));
  app.use(routeFactories.childDetail({ pool, parentLeagueName, activityLabel }));
  app.use(routeFactories.childUnlink({ pool }));
}

module.exports = registerParentFamilyRoutes;
