const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminUserDetailController,
} = require("../controllers/adminUserDetailController");

function createAdminUserDetailRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminUserDetailController({ pool });
  router.get("/admin/users/:id", requireAdmin, controller.getById);
  return router;
}

module.exports = createAdminUserDetailRoutes;
