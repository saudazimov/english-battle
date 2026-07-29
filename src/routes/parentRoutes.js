const createStudentParentConnectionRoutes = require("./studentParentConnectionRoutes");
const registerParentFamilyRoutes = require("./parentFamilyRoutes");

const defaultRoutes = {
  createStudentConnection: createStudentParentConnectionRoutes,
  registerFamily: registerParentFamilyRoutes,
};

function registerParentRoutes({
  app,
  pool,
  assignNewParentCode,
  maskParentPhone,
  parentCode,
  parentLinkBlocked,
  parentLinkNoteFail,
  parentLinkNoteOk,
  parentLeagueName,
  activityLabel,
  routes = defaultRoutes,
}) {
  app.use(routes.createStudentConnection({
    pool,
    assignNewParentCode,
    maskParentPhone,
  }));
  routes.registerFamily({
    app,
    pool,
    parentCode,
    parentLinkBlocked,
    parentLinkNoteFail,
    parentLinkNoteOk,
    parentLeagueName,
    activityLabel,
  });
}

module.exports = registerParentRoutes;
