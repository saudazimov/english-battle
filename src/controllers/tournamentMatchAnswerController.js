const {
  createTournamentMatchAnswerService,
} = require("../services/tournamentMatchAnswerService");

function createTournamentMatchAnswerController(dependencies) {
  const { pool } = dependencies;
  const service = createTournamentMatchAnswerService(dependencies);

  async function submitAnswer(req, res) {
    const client = await pool.connect();
    try {
      const outcome = await service.submitAnswer(
        client,
        req.params.id,
        req.user.id,
        req.body
      );
      const errors = {
        "invalid-answer": [400, "Javob varianti noto'g'ri"],
        inactive: [400, "Jang faol emas"],
        "not-active-participant": [403, "Siz bu matchning faol ishtirokchisi emassiz"],
        finished: [400, "Siz jangni allaqachon yakunlagansiz"],
        expired: [400, "Jang vaqti tugagan"],
        "question-not-found": [400, "Savol topilmadi"],
        duplicate: [409, "Bu savolga allaqachon javob bergansiz"],
      };
      if (errors[outcome.status]) {
        const [statusCode, error] = errors[outcome.status];
        return res.status(statusCode).json({ error });
      }

      return res.json({
        success: true,
        correct: outcome.correct,
        correct_option: outcome.correctOption,
        team_scores: outcome.teamScores,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Answer xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    } finally {
      client.release();
    }
  }

  return { submitAnswer };
}

module.exports = { createTournamentMatchAnswerController };
