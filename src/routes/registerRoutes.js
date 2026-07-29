const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const { createRegisterController } = require("../controllers/registerController");

function registerRoutes(dependencies) {
  const router = express.Router();
  const controller = createRegisterController(dependencies);

  router.post(
    "/register",
    requireNormalizedPhone,
    dependencies.otpVerifyGate,
    controller.register
  );

  return router;
}

module.exports = registerRoutes;
