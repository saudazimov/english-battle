const {
  createTournamentMatchBattleStateService,
} = require("../services/tournamentMatchBattleStateService");

function createTournamentMatchBattleStateController({ pool }) {
  const service = createTournamentMatchBattleStateService({ pool });

  async function getBattleState(req, res) {
    try {
      const outcome = await service.getBattleState(req.params.id, req.user.id);
      if (outcome.status === "not-participant") {
        return res.status(403).json({ error: "Siz bu matchning ishtirokchisi emassiz" });
      }
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Match topilmadi" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Battle-state xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getBattleState };
}

module.exports = { createTournamentMatchBattleStateController };
