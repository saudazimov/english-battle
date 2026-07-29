const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const {
  createPasswordResetSendController,
} = require("../controllers/passwordResetSendController");

function passwordResetSendRoutes({
  pool,
  bcrypt,
  generateOtpCode,
  sendSms,
  otpSendPerIp,
  otpSendPerPhone,
}) {
  const router = express.Router();
  const controller = createPasswordResetSendController({
    pool,
    bcrypt,
    generateOtpCode,
    sendSms,
  });

  router.post(
    "/password-reset/send",
    requireNormalizedPhone,
    otpSendPerIp,
    otpSendPerPhone,
    controller.sendResetOtp
  );

  return router;
}

module.exports = passwordResetSendRoutes;
