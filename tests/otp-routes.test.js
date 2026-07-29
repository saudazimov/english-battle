const test = require("node:test");
const assert = require("node:assert/strict");

const registerOtpRoutes = require("../src/routes/otpRoutes");

test("OTP routes preserve mount order and dependencies", () => {
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
    verify(dependencies) {
      calls.push(["verify", dependencies]);
      return "verify-router";
    },
  };

  registerOtpRoutes({
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

  assert.deepEqual(mounted, ["send-router", "verify-router"]);
  assert.deepEqual(calls, [
    ["send", {
      pool,
      bcrypt,
      generateOtpCode,
      sendSms,
      otpSendPerIp,
      otpSendPerPhone,
    }],
    ["verify", {
      pool,
      bcrypt,
      otpVerifyGate,
      noteFail,
      noteOk,
      phoneIpKey,
    }],
  ]);
});
