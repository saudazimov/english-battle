const {
  createAdminTournamentCreateService,
} = require("../services/adminTournamentCreateService");

function createAdminTournamentCreateController({ pool, sanitizeText }) {
  const service = createAdminTournamentCreateService({ pool });

  async function createTournament(req, res) {
    try {
      const {
        name,
        region,
        district,
        team_size,
        reserve_size,
        questions_per_match,
        seconds_per_match,
        registration_deadline,
        starts_at,
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Turnir nomi kerak" });
      }
      if (!region || !district) {
        return res.status(400).json({ error: "Viloyat va tuman tanlang" });
      }

      const safeTournamentName = sanitizeText(name, 200);
      const teamSize = parseInt(team_size) || 5;
      const reserveSize = parseInt(reserve_size) || 2;
      const questionsPerMatch = parseInt(questions_per_match) || 20;
      const secondsPerMatch = parseInt(seconds_per_match) || 300;
      if (teamSize < 1 || teamSize > 10) {
        return res.status(400).json({ error: "Jamoa hajmi 1-10 oralig'ida" });
      }

      const result = await service.createTournament({
        name: safeTournamentName,
        region,
        district,
        teamSize,
        reserveSize,
        questionsPerMatch,
        secondsPerMatch,
        registrationDeadline: registration_deadline,
        startsAt: starts_at,
      });
      if (!result.tournament) {
        return res.status(400).json({
          error: "Bu tumanda kamida 2 ta maktab kerak (hozir: " + result.schoolCount + ")",
        });
      }

      return res.json({
        success: true,
        tournament: result.tournament,
        eligible_schools: result.schoolCount,
      });
    } catch (err) {
      console.error("Turnir yaratish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi: " + err.message });
    }
  }

  return { createTournament };
}

module.exports = { createAdminTournamentCreateController };
