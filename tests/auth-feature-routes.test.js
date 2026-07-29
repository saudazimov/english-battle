const test = require("node:test");
const assert = require("node:assert/strict");

const { createAuthFeatureRoutes } = require("../src/routes/authFeatureRoutes");

test("auth feature preserves registrar order and session instance", () => {
  const calls = [];
  const app = {};
  const otpDependencies = { app, pool: {} };
  const registrationDependencies = { app, usernameRegex: /test/ };
  const resetDependencies = { app, sendSms() {} };
  const sessionDependencies = { pool: {}, signToken() {} };
  const routes = {
    registerOtp(dependencies) {
      calls.push(["otp", dependencies]);
    },
    registerRegistration(dependencies) {
      calls.push(["registration", dependencies]);
    },
    registerPasswordReset(dependencies) {
      calls.push(["password-reset", dependencies]);
    },
    createSession(dependencies) {
      calls.push(["create-session", dependencies]);
      return {
        registerLoginRoutes(receivedApp) {
          calls.push(["login", receivedApp]);
        },
        registerLogoutRoutes(receivedApp) {
          calls.push(["logout", receivedApp]);
        },
      };
    },
  };
  const feature = createAuthFeatureRoutes({ routes });

  feature.registerOtpRoutes(otpDependencies);
  feature.registerRegistrationRoutes(registrationDependencies);
  feature.registerPasswordResetRoutes(resetDependencies);
  feature.initializeSessionRoutes(sessionDependencies);
  feature.registerLoginRoutes(app);
  feature.registerLogoutRoutes(app);

  assert.deepEqual(calls, [
    ["otp", otpDependencies],
    ["registration", registrationDependencies],
    ["password-reset", resetDependencies],
    ["create-session", sessionDependencies],
    ["login", app],
    ["logout", app],
  ]);
});
