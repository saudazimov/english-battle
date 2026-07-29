const test = require("node:test");
const assert = require("node:assert/strict");

const registerRegistrationRoutes = require("../src/routes/registrationRoutes");

test("registration routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = { use(router) { mounted.push(router); } };
  const dependencies = {
    pool: {},
    bcrypt: {},
    validatePassword: () => {},
    usernameRegex: /^[a-z0-9_]+$/,
    usernameLookupLimiter: () => {},
    schoolInvite: {},
    noteFail: () => {},
    noteOk: () => {},
    phoneIpKey: () => {},
    validateGlobalLocation: () => {},
    stripUnsafe: () => {},
    normalizeSchool: () => {},
    signToken: () => {},
    otpVerifyGate: () => {},
  };
  const routeFactories = {
    usernameAvailability(routeDependencies) {
      calls.push(["usernameAvailability", routeDependencies]);
      return "username-router";
    },
    register(routeDependencies) {
      calls.push(["register", routeDependencies]);
      return "register-router";
    },
  };

  registerRegistrationRoutes({
    app,
    ...dependencies,
    routeFactories,
  });

  assert.deepEqual(mounted, ["username-router", "register-router"]);
  assert.deepEqual(calls, [
    ["usernameAvailability", {
      pool: dependencies.pool,
      usernameLookupLimiter: dependencies.usernameLookupLimiter,
      usernameRegex: dependencies.usernameRegex,
    }],
    ["register", {
      pool: dependencies.pool,
      bcrypt: dependencies.bcrypt,
      validatePassword: dependencies.validatePassword,
      usernameRegex: dependencies.usernameRegex,
      schoolInvite: dependencies.schoolInvite,
      noteFail: dependencies.noteFail,
      noteOk: dependencies.noteOk,
      phoneIpKey: dependencies.phoneIpKey,
      validateGlobalLocation: dependencies.validateGlobalLocation,
      stripUnsafe: dependencies.stripUnsafe,
      normalizeSchool: dependencies.normalizeSchool,
      signToken: dependencies.signToken,
      otpVerifyGate: dependencies.otpVerifyGate,
    }],
  ]);
});
