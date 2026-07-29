const {
  createAdminTournamentEditService,
} = require("../services/adminTournamentEditService");

function createAdminTournamentEditController({ pool }) {
  const service = createAdminTournamentEditService({ pool });

  async function edit(req, res) {
    try {
      const outcome = await service.editTournament(req.params.id, req.body);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Turnir topilmadi" });
      }
      if (outcome.status === "blocked") {
        return res.status(400).json({
          error: "Setka tuzilgani uchun o'zgartirib bo'lmaydi: " + outcome.blocked.join(", "),
        });
      }
      if (outcome.status === "empty") {
        return res.status(400).json({ error: "O'zgartirish uchun ma'lumot yo'q" });
      }

      return res.json({ success: true, tournament: outcome.tournament });
    } catch (err) {
      console.error("Turnir tahrirlash xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi: " + err.message });
    }
  }

  return { edit };
}

module.exports = { createAdminTournamentEditController };
