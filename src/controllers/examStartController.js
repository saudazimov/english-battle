const { createExamStartService } = require("../services/examStartService");

function createExamStartController({ pool, randomUUID }) {
  const service = createExamStartService({ pool, randomUUID });

  async function startExam(req, res) {
    try {
      const outcome = await service.startExam(req.user.id);
      if (outcome.status === "user-not-found") {
        return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      }
      if (outcome.status === "insufficient-questions") {
        return res.status(400).json({
          error: "Imtihon uchun yetarli savol yo'q (kamida 10 ta kerak)",
        });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Imtihon start xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { startExam };
}

module.exports = { createExamStartController };
