const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminUserListController,
} = require("../controllers/adminUserListController");

function createAdminUserListRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminUserListController({ pool });
  router.get("/admin/users", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminUserListRoutes;
