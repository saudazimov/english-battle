const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const {
  createSchoolTournamentStudentsController,
} = require("../controllers/schoolTournamentStudentsController");

function createSchoolTournamentStudentsRoutes({ getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolTournamentStudentsController({ pool, getSchoolAdmin });
  router.get("/school/tournaments/:id/students", authMiddleware, controller.list);
  return router;
}

module.exports = createSchoolTournamentStudentsRoutes;
