const registerOtpRoutes = require("./otpRoutes");
const registerRegistrationRoutes = require("./registrationRoutes");
const registerPasswordResetRoutes = require("./passwordResetRoutes");
const { createAuthSessionRoutes } = require("./authSessionRoutes");

const defaultRoutes = {
  registerOtp: registerOtpRoutes,
  registerRegistration: registerRegistrationRoutes,
  registerPasswordReset: registerPasswordResetRoutes,
  createSession: createAuthSessionRoutes,
};

function createAuthFeatureRoutes({ routes = defaultRoutes } = {}) {
  let sessionRoutes;

  return {
    registerOtpRoutes(dependencies) {
      routes.registerOtp(dependencies);
    },
    registerRegistrationRoutes(dependencies) {
      routes.registerRegistration(dependencies);
    },
    registerPasswordResetRoutes(dependencies) {
      routes.registerPasswordReset(dependencies);
    },
    initializeSessionRoutes(dependencies) {
      sessionRoutes = routes.createSession(dependencies);
    },
    registerLoginRoutes(app) {
      sessionRoutes.registerLoginRoutes(app);
    },
    registerLogoutRoutes(app) {
      sessionRoutes.registerLogoutRoutes(app);
    },
  };
}

module.exports = { createAuthFeatureRoutes };
