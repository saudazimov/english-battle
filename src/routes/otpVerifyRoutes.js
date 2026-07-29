const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const { createOtpVerifyController } = require("../controllers/otpVerifyController");

function otpVerifyRoutes({
  pool,
  bcrypt,
  otpVerifyGate,
  noteFail,
  noteOk,
  phoneIpKey,
}) {
  const router = express.Router();
  const controller = createOtpVerifyController({
    pool,
    bcrypt,
    noteFail,
    noteOk,
    phoneIpKey,
  });

  router.post(
    "/otp/verify",
    requireNormalizedPhone,
    otpVerifyGate,
    controller.verifyOtp
  );

  return router;
}

module.exports = otpVerifyRoutes;
