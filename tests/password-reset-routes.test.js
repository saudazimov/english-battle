const test = require("node:test");
const assert = require("node:assert/strict");

const registerPasswordResetRoutes = require("../src/routes/passwordResetRoutes");

test("password reset routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const bcrypt = {};
  const generateOtpCode = () => {};
  const sendSms = () => {};
  const otpSendPerIp = () => {};
  const otpSendPerPhone = () => {};
  const otpVerifyGate = () => {};
  const noteFail = () => {};
  const noteOk = () => {};
  const phoneIpKey = () => {};
  const routeFactories = {
    send(dependencies) {
      calls.push(["send", dependencies]);
      return "send-router";
    },
    confirm(dependencies) {
      calls.push(["confirm", dependencies]);
      return "confirm-router";
    },
  };

  registerPasswordResetRoutes({
    app,
    pool,
    bcrypt,
    generateOtpCode,
    sendSms,
    otpSendPerIp,
    otpSendPerPhone,
    otpVerifyGate,
    noteFail,
    noteOk,
    phoneIpKey,
    routeFactories,
  });

  assert.deepEqual(mounted, ["send-router", "confirm-router"]);
  assert.deepEqual(calls, [
    ["send", {
      pool,
      bcrypt,
      generateOtpCode,
      sendSms,
      otpSendPerIp,
      otpSendPerPhone,
    }],
    ["confirm", {
      pool,
      bcrypt,
      otpVerifyGate,
      noteFail,
      noteOk,
      phoneIpKey,
    }],
  ]);
});
