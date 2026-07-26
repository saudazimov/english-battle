const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const {
  createSchoolTournamentTeamListController,
} = require("../controllers/schoolTournamentTeamListController");

function createSchoolTournamentTeamListRoutes({ getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolTournamentTeamListController({ pool, getSchoolAdmin });
  router.get("/school/tournaments/:id/team", authMiddleware, controller.list);
  return router;
}

module.exports = createSchoolTournamentTeamListRoutes;
