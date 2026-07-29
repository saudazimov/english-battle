const {
  createStudentTournamentBracketService,
} = require("../services/studentTournamentBracketService");

function createStudentTournamentBracketController({ pool }) {
  const service = createStudentTournamentBracketService({ pool });

  async function getBracket(req, res) {
    try {
      const outcome = await service.getBracket(req.params.id, req.user.id);
      if (outcome.status === "not-member") {
        return res.status(403).json({ error: "Siz bu turnir ishtirokchisi emassiz" });
      }
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Turnir topilmadi" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Student bracket xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getBracket };
}

module.exports = { createStudentTournamentBracketController };
