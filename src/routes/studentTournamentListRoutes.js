const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createStudentTournamentListController,
} = require("../controllers/studentTournamentListController");

function studentTournamentListRoutes({ pool }) {
  const router = express.Router();
  const controller = createStudentTournamentListController({ pool });

  router.get("/student/tournaments", authMiddleware, controller.listTournaments);

  return router;
}

module.exports = studentTournamentListRoutes;
