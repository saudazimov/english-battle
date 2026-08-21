const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const { createRegisterController } = require("../controllers/registerController");

function registerRoutes(dependencies) {
  const router = express.Router();
  const controller = createRegisterController(dependencies);

  function requirePublicRegistrationEnabled(req, res, next) {
    const configured = dependencies.publicRegistrationEnabled;
    const enabled = configured === undefined
      ? process.env.PUBLIC_REGISTRATION_ENABLED === "true"
      : configured === true;

    if (!enabled) {
      return res.status(403).json({
        error: "Ochiq ro'yxatdan o'tish vaqtincha yopilgan",
      });
    }

    return next();
  }

  router.post(
    "/register",
    requirePublicRegistrationEnabled,
    requireNormalizedPhone,
    dependencies.otpVerifyGate,
    controller.register
  );

  return router;
}

module.exports = registerRoutes;
