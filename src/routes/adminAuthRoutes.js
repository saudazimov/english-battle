const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminAuthController,
} = require("../controllers/adminAuthController");

function createAdminAuthRoutes(dependencies) {
  const controller = createAdminAuthController(dependencies);
  const loginRouter = express.Router();
  const passwordRouter = express.Router();

  loginRouter.post(
    "/admin/login",
    dependencies.adminLoginRateLimit,
    controller.login
  );
  passwordRouter.post(
    "/admin/settings/password",
    requireAdmin,
    controller.changePassword
  );
  return { loginRouter, passwordRouter };
}

module.exports = { createAdminAuthRoutes };
