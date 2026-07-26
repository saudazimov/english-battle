function createAdminTournamentRegionsController({ regions }) {
  return {
    list(req, res) {
      res.json({ regions });
    },
  };
}

module.exports = { createAdminTournamentRegionsController };
