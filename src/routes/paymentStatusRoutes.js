const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createPaymentStatusController } = require("../controllers/paymentStatusController");

function createPaymentStatusRoutes() {
  const router = express.Router();
  const controller = createPaymentStatusController({ pool });
  router.get("/payments/:id/status", authMiddleware, controller.status);
  return router;
}

module.exports = createPaymentStatusRoutes;
