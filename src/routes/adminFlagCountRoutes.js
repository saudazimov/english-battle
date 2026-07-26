const express = require("express");
const pool = require("../../db");
const { requireAdmin } = require("../../auth");
const { createAdminFlagCountController } = require("../controllers/adminFlagCountController");

function createAdminFlagCountRoutes() {
  const router = express.Router();
  const controller = createAdminFlagCountController({ pool });
  router.get("/admin/flags/count", requireAdmin, controller.count);
  return router;
}

module.exports = createAdminFlagCountRoutes;
