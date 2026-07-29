const passwordResetSendRoutes = require("./passwordResetSendRoutes");
const passwordResetConfirmRoutes = require("./passwordResetConfirmRoutes");

const defaultRouteFactories = {
  send: passwordResetSendRoutes,
  confirm: passwordResetConfirmRoutes,
};

function registerPasswordResetRoutes({
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
  app.use(routeFactories.confirm({
    pool,
    bcrypt,
    otpVerifyGate,
    noteFail,
    noteOk,
    phoneIpKey,
  }));
}

module.exports = registerPasswordResetRoutes;
