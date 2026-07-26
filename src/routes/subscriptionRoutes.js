const express = require("express");
const premium = require("../../premium");
const { authMiddleware } = require("../../auth");
const { createSubscriptionController } = require("../controllers/subscriptionController");

function createSubscriptionRoutes() {
  const router = express.Router();
  const controller = createSubscriptionController({ premium });
  router.get("/me/subscription", authMiddleware, controller.current);
  return router;
}

module.exports = createSubscriptionRoutes;
