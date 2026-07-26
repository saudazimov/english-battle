const express = require("express");
const { createHealthController } = require("../controllers/healthController");

function createHealthRoutes({ pool }) {
  const router = express.Router();
  const controller = createHealthController({ pool });

  router.get("/health", controller.health);
  router.get("/ready", controller.ready);

  return router;
}

module.exports = { createHealthRoutes };
