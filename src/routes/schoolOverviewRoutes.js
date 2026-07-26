const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createSchoolOverviewController } = require("../controllers/schoolOverviewController");

function createSchoolOverviewRoutes({ getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolOverviewController({ pool, getSchoolAdmin });
  router.get("/school/overview", authMiddleware, controller.getOverview);
  return router;
}

module.exports = createSchoolOverviewRoutes;
