const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createSchoolTournamentsController } = require("../controllers/schoolTournamentsController");

function createSchoolTournamentsRoutes({ getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolTournamentsController({ pool, getSchoolAdmin });
  router.get("/school/tournaments", authMiddleware, controller.list);
  return router;
}

module.exports = createSchoolTournamentsRoutes;
