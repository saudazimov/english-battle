const express = require("express");
const pool = require("../../db");
const { createDistrictRankingsController } = require("../controllers/districtRankingsController");

function createDistrictRankingsRoutes() {
  const router = express.Router();
  const controller = createDistrictRankingsController({ pool });
  router.get("/rankings/districts", controller.list);
  return router;
}

module.exports = createDistrictRankingsRoutes;
