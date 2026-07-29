const usernameAvailabilityRoutes = require("./usernameAvailabilityRoutes");
const registerRoutes = require("./registerRoutes");

const defaultRouteFactories = {
  usernameAvailability: usernameAvailabilityRoutes,
  register: registerRoutes,
};

function registerRegistrationRoutes({
  app,
  pool,
  bcrypt,
  validatePassword,
  usernameRegex,
  usernameLookupLimiter,
  schoolInvite,
  noteFail,
  noteOk,
  phoneIpKey,
  validateGlobalLocation,
  stripUnsafe,
  normalizeSchool,
  signToken,
  otpVerifyGate,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.usernameAvailability({
    pool,
    usernameLookupLimiter,
    usernameRegex,
  }));
  app.use(routeFactories.register({
    pool,
    bcrypt,
    validatePassword,
    usernameRegex,
    schoolInvite,
    noteFail,
    noteOk,
    phoneIpKey,
    validateGlobalLocation,
    stripUnsafe,
    normalizeSchool,
    signToken,
    otpVerifyGate,
  }));
}

module.exports = registerRegistrationRoutes;
