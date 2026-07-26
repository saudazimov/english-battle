const express = require("express");
const pool = require("../../db");
const { createRegionRankingsController } = require("../controllers/regionRankingsController");

function createRegionRankingsRoutes() {
  const router = express.Router();
  const controller = createRegionRankingsController({ pool });
  router.get("/rankings/regions", controller.list);
  return router;
}

module.exports = createRegionRankingsRoutes;
