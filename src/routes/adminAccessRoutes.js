const { createAdminAuthRoutes } = require("./adminAuthRoutes");
const registerAdminSessionRoutes = require("./adminSessionRoutes");

const defaultFactories = {
  createAuth: createAdminAuthRoutes,
  registerSession: registerAdminSessionRoutes,
};

function createAdminAccessRoutes(dependencies, factories = defaultFactories) {
  const authRoutes = factories.createAuth(dependencies);

  return {
    registerLoginRoutes(app) {
      app.use(authRoutes.loginRouter);
    },
    registerSessionRoutes(app) {
      factories.registerSession({
        app,
        pool: dependencies.pool,
        logAudit: dependencies.logAudit,
      });
    },
    registerPasswordRoutes(app) {
      app.use(authRoutes.passwordRouter);
    },
  };
}

module.exports = { createAdminAccessRoutes };
