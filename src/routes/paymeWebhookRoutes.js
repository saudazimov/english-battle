const express = require("express");
const payme = require("../../payme");
const { createPaymeWebhookController } = require("../controllers/paymeWebhookController");

function createPaymeWebhookRoutes() {
  const router = express.Router();
  const controller = createPaymeWebhookController({ payme });
  router.post("/payments/payme", controller.handle);
  return router;
}

module.exports = createPaymeWebhookRoutes;
