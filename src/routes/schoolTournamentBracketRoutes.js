const express = require("express");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const {
  createSchoolTournamentBracketController,
} = require("../controllers/schoolTournamentBracketController");

function createSchoolTournamentBracketRoutes({ getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolTournamentBracketController({ pool, getSchoolAdmin });
  router.get("/school/tournaments/:id/bracket", authMiddleware, controller.getBracket);
  return router;
}

module.exports = createSchoolTournamentBracketRoutes;
