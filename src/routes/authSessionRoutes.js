const loginRoutes = require("./loginRoutes");
const logoutRoutes = require("./logoutRoutes");

const defaultRouteFactories = {
  login: loginRoutes,
  logout: logoutRoutes,
};

function createAuthSessionRoutes({
  pool,
  bcrypt,
  loginGate,
  noteFail,
  noteOk,
  phoneIpKey,
  signToken,
  routeFactories = defaultRouteFactories,
}) {
  function registerLoginRoutes(app) {
    app.use(routeFactories.login({
      pool,
      bcrypt,
      loginGate,
      noteFail,
      noteOk,
      phoneIpKey,
      signToken,
    }));
  }

  function registerLogoutRoutes(app) {
    app.use(routeFactories.logout());
  }

  return { registerLoginRoutes, registerLogoutRoutes };
}

module.exports = { createAuthSessionRoutes };
