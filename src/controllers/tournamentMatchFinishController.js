const {
  createTournamentMatchFinishService,
} = require("../services/tournamentMatchFinishService");

function createTournamentMatchFinishController(dependencies) {
  const { pool } = dependencies;
  const service = createTournamentMatchFinishService(dependencies);

  async function finishMatch(req, res) {
    const client = await pool.connect();
    try {
      const outcome = await service.finishMatch(client, req.params.id, req.user.id);
      if (outcome.status === "inactive") {
        return res.status(400).json({ error: "Jang faol emas" });
      }
      if (outcome.status === "not-active-participant") {
        return res.status(403).json({ error: "Faol ishtirokchi emassiz" });
      }
      if (outcome.status === "already-finished") {
        return res.json({ success: true, already_finished: true });
      }
      if (outcome.status === "incomplete") {
        return res.status(400).json({ error: "Avval barcha savollarga javob bering" });
      }

      return res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Finish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    } finally {
      client.release();
    }
  }

  return { finishMatch };
}

module.exports = { createTournamentMatchFinishController };
