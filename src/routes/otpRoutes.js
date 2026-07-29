const otpSendRoutes = require("./otpSendRoutes");
const otpVerifyRoutes = require("./otpVerifyRoutes");

const defaultRouteFactories = {
  send: otpSendRoutes,
  verify: otpVerifyRoutes,
};

function registerOtpRoutes({
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
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.send({
    pool,
    bcrypt,
    generateOtpCode,
    sendSms,
    otpSendPerIp,
    otpSendPerPhone,
  }));
  app.use(routeFactories.verify({
    pool,
    bcrypt,
    otpVerifyGate,
    noteFail,
    noteOk,
    phoneIpKey,
  }));
}

module.exports = registerOtpRoutes;
