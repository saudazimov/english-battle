const express = require("express");
const pool = require("../../db");
const { requireAdmin } = require("../../auth");
const { createAdminSettingsInfoController } = require("../controllers/adminSettingsInfoController");

function createAdminSettingsInfoRoutes() {
  const router = express.Router();
  const controller = createAdminSettingsInfoController({ pool });
  router.get("/admin/settings/info", requireAdmin, controller.info);
  return router;
}

module.exports = createAdminSettingsInfoRoutes;
