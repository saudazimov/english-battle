const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createPaymentCreateController } = require("../controllers/paymentCreateController");

function createPaymentCreateRoutes() {
  const router = express.Router();
  const controller = createPaymentCreateController({ pool });
  router.post("/payments/create", authMiddleware, controller.create);
  return router;
}

module.exports = createPaymentCreateRoutes;
