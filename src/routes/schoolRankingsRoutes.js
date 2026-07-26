const express = require("express");
const pool = require("../../db");
const { createSchoolRankingsController } = require("../controllers/schoolRankingsController");

function createSchoolRankingsRoutes() {
  const router = express.Router();
  const controller = createSchoolRankingsController({ pool });
  router.get("/rankings/schools", controller.list);
  return router;
}

module.exports = createSchoolRankingsRoutes;
