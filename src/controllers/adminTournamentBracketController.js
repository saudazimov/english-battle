const {
  createAdminTournamentBracketService,
} = require("../services/adminTournamentBracketService");

function createAdminTournamentBracketController({ pool }) {
  const service = createAdminTournamentBracketService({ pool });

  async function getBracket(req, res) {
    try {
      const result = await service.getBracket(req.params.id);
      if (!result) return res.status(404).json({ error: "Turnir topilmadi" });

      return res.json(result);
    } catch (err) {
      console.error("Setka o'qish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getBracket };
}

module.exports = { createAdminTournamentBracketController };
