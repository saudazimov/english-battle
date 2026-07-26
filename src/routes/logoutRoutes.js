const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createLogoutController } = require("../controllers/logoutController");

function createLogoutRoutes() {
  const router = express.Router();
  const controller = createLogoutController({ pool });
  router.post("/logout", authMiddleware, controller.logout);
  return router;
}

module.exports = createLogoutRoutes;
