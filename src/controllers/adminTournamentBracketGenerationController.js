const {
  createAdminTournamentBracketGenerationService,
} = require("../services/adminTournamentBracketGenerationService");

function createAdminTournamentBracketGenerationController({
  pool,
  seedOrder,
  propagateByes,
}) {
  const service = createAdminTournamentBracketGenerationService({
    seedOrder,
    propagateByes,
  });

  async function generateBracket(req, res) {
    const client = await pool.connect();
    try {
      const outcome = await service.generateBracket(client, req.params.id);
      if (outcome.status === "not-found") {
        client.release();
        return res.status(404).json({ error: "Turnir topilmadi" });
      }
      if (outcome.status === "invalid-status") {
        client.release();
        return res.status(400).json({
          error: "Setka faqat 'Ro'yxat' bosqichida yaratiladi (hozir: "
            + outcome.tournamentStatus + ")",
        });
      }
      if (outcome.status === "insufficient-schools") {
        client.release();
        return res.status(400).json({
          error: "Setka uchun kamida 2 ta maktab kerak (jamoa tuzgan: "
            + outcome.schoolCount + ")",
        });
      }

      client.release();
      res.json(outcome.result);
    } catch (err) {
      await client.query("ROLLBACK");
      client.release();
      console.error("Setka generatsiya xatosi:", err.message);
      res.status(500).json({ error: "Server xatosi: " + err.message });
    }
  }

  return { generateBracket };
}

module.exports = { createAdminTournamentBracketGenerationController };
