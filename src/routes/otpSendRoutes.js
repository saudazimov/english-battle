const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const { createOtpSendController } = require("../controllers/otpSendController");

function otpSendRoutes({
  pool,
  bcrypt,
  generateOtpCode,
  sendSms,
  otpSendPerIp,
  otpSendPerPhone,
}) {
  const router = express.Router();
  const controller = createOtpSendController({
    pool,
    bcrypt,
    generateOtpCode,
    sendSms,
  });

  router.post(
    "/otp/send",
    requireNormalizedPhone,
    otpSendPerIp,
    otpSendPerPhone,
    controller.sendOtp
  );

  return router;
}

module.exports = otpSendRoutes;
