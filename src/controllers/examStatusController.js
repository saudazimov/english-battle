const { createExamStatusService } = require("../services/examStatusService");

function createExamStatusController({ pool, getNextLevel }) {
  const service = createExamStatusService({ pool, getNextLevel });

  async function getStatus(req, res) {
    try {
      const result = await service.getStatus(req.user.id);
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
