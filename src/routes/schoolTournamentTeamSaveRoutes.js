const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const {
  createSchoolTournamentTeamSaveController,
} = require("../controllers/schoolTournamentTeamSaveController");

function createSchoolTournamentTeamSaveRoutes({ getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolTournamentTeamSaveController({ pool, getSchoolAdmin });
  router.post("/school/tournaments/:id/team", authMiddleware, controller.save);
  return router;
}

module.exports = createSchoolTournamentTeamSaveRoutes;
