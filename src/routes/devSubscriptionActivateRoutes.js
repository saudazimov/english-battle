const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createDevSubscriptionActivateController,
} = require("../controllers/devSubscriptionActivateController");

function createDevSubscriptionActivateRoutes({ premium, logAudit }) {
  const router = express.Router();
  const controller = createDevSubscriptionActivateController({
    premium,
    logAudit,
  });
  router.post(
    "/dev/subscription/activate",
    requireAdmin,
    controller.activate
  );
  return router;
}

module.exports = createDevSubscriptionActivateRoutes;
