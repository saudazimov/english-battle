const {
  createTournamentMatchPlayerCheckinService,
} = require("../services/tournamentMatchPlayerCheckinService");

function createTournamentMatchPlayerCheckinController({ pool, notifyMatchPlayers }) {
  const service = createTournamentMatchPlayerCheckinService({ notifyMatchPlayers });

  async function checkIn(req, res) {
    const client = await pool.connect();
    try {
      const outcome = await service.checkIn(client, req.params.id, req.user.id);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Match topilmadi" });
      }
      if (outcome.status === "not-open") {
        return res.status(400).json({
          error: "Check-in hozir ochiq emas (holat: " + outcome.matchStatus + ")",
        });
      }
      if (outcome.status === "not-participant") {
        return res.status(403).json({ error: "Siz bu matchning ishtirokchisi emassiz" });
      }
      if (outcome.status === "team-full") {
        return res.status(409).json({ error: "Jamoaning barcha jang o'rinlari band" });
      }

      return res.json({ success: true, checked_in: true });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Checkin xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    } finally {
      client.release();
    }
  }

  return { checkIn };
}

module.exports = { createTournamentMatchPlayerCheckinController };
