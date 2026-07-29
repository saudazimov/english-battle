const { createExamHistoryService } = require("../services/examHistoryService");

function createExamHistoryController({ pool }) {
  const service = createExamHistoryService({ pool });

  async function listAttempts(req, res) {
    try {
      const targetId = parseInt(req.params.userId, 10);
      if (isNaN(targetId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (targetId !== req.user.id) {
        return res.status(403).json({ error: "Ruxsat yo'q" });
      }

      const attempts = await service.listAttempts(targetId);
      return res.json({ attempts });
    } catch (err) {
      console.error("Imtihon tarixi xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listAttempts };
}

module.exports = { createExamHistoryController };
