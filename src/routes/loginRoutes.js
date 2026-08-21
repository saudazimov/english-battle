const express = require("express");
const { requireNormalizedPhone } = require("../middleware/requireNormalizedPhone");
const { createLoginController } = require("../controllers/loginController");

function loginRoutes({
  pool,
  bcrypt,
  loginGate,
  noteFail,
  noteOk,
  phoneIpKey,
  signToken,
}) {
  const router = express.Router();
  const controller = createLoginController({
    pool,
    bcrypt,
    noteFail,
    noteOk,
    phoneIpKey,
    signToken,
  });

  function normalizeLegacyPhone(req, res, next) {
    if (req.body && req.body.login) return next();
    return requireNormalizedPhone(req, res, next);
  }

  router.post("/login", normalizeLegacyPhone, loginGate, controller.login);

  return router;
}

module.exports = loginRoutes;
