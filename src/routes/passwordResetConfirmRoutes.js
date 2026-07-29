const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const {
  createPasswordResetConfirmController,
} = require("../controllers/passwordResetConfirmController");

function passwordResetConfirmRoutes({
  pool,
  bcrypt,
  otpVerifyGate,
  noteFail,
  noteOk,
  phoneIpKey,
}) {
  const router = express.Router();
  const controller = createPasswordResetConfirmController({
    pool,
    bcrypt,
    noteFail,
    noteOk,
    phoneIpKey,
  });

  router.post(
    "/password-reset/confirm",
    requireNormalizedPhone,
    otpVerifyGate,
    controller.confirmReset
  );

  return router;
}

module.exports = passwordResetConfirmRoutes;
