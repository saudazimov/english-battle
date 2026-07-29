const {
  createTournamentMatchCheckinStateService,
} = require("../services/tournamentMatchCheckinStateService");

function createTournamentMatchCheckinStateController({ pool }) {
  const service = createTournamentMatchCheckinStateService({ pool });

  async function getCheckinState(req, res) {
    try {
      const outcome = await service.getCheckinState(req.params.id, req.user.id);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Match topilmadi" });
      }
      if (outcome.status === "not-participant") {
        return res.status(403).json({ error: "Siz bu matchning ishtirokchisi emassiz" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Checkin-state xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getCheckinState };
}

module.exports = { createTournamentMatchCheckinStateController };
