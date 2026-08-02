const { createExamHistoryService } = require("../services/examHistoryService");
const { resolveOwnedUserId } = require("../utils/ownedUserId");

function createExamHistoryController({ pool }) {
  const service = createExamHistoryService({ pool });

  async function listAttempts(req, res) {
    try {
      const owner = resolveOwnedUserId(req.params.userId, req.user.id);
      if (owner.status === "invalid") {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (owner.status === "forbidden") {
        return res.status(403).json({ error: "Ruxsat yo'q" });
      }

      const attempts = await service.listAttempts(owner.userId);
      return res.json({ attempts });
    } catch (err) {
      console.error("Imtihon tarixi xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listAttempts };
}

module.exports = { createExamHistoryController };
