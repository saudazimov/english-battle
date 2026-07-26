const express = require("express");
const { requireAdmin } = require("../../auth");
const {
  createAdminTournamentDistrictSchoolsController,
} = require("../controllers/adminTournamentDistrictSchoolsController");

function createAdminTournamentDistrictSchoolsRoutes({ pool }) {
  const router = express.Router();
  const controller = createAdminTournamentDistrictSchoolsController({ pool });
  router.get(
    "/admin/tournaments/schools-in-district",
    requireAdmin,
    controller.list
  );
  return router;
}

module.exports = createAdminTournamentDistrictSchoolsRoutes;
