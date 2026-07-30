const { createExamStatusService } = require("../services/examStatusService");
const { resolveOwnedUserId } = require("../utils/ownedUserId");

function createExamStatusController({ pool, getNextLevel }) {
  const service = createExamStatusService({ pool, getNextLevel });

  async function getStatus(req, res) {
    try {
      const owner = resolveOwnedUserId(req.params.userId, req.user.id);
      if (owner.status === "invalid") {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (owner.status === "forbidden") {
        return res.status(403).json({ error: "Ruxsat yo'q" });
      }

      const result = await service.getStatus(owner.userId);
      if (!result) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

      return res.json(result);
    } catch (err) {
      console.error("Imtihon status xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getStatus };
}

module.exports = { createExamStatusController };
