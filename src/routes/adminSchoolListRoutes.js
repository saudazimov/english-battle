const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminSchoolListController,
} = require("../controllers/adminSchoolListController");

function createAdminSchoolListRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminSchoolListController({ pool });
  router.get("/admin/schools", requireAdmin, controller.list);
  return router;
}

module.exports = createAdminSchoolListRoutes;
