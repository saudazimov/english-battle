const {
  createParentChildDetailService,
} = require("../services/parentChildDetailService");

function createParentChildDetailController({ pool, parentLeagueName, activityLabel }) {
  const service = createParentChildDetailService({ pool, parentLeagueName, activityLabel });

  async function getChildDetail(req, res) {
    try {
      const parentId = req.user.id;
      const studentId = parseInt(req.params.studentId, 10);
      if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const outcome = await service.getChildDetail({ parentId, studentId });
      if (outcome.status === "forbidden") {
        return res.status(403).json({ error: "Bu farzandga ruxsatingiz yo'q" });
      }
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Farzand topilmadi" });
      }
      return res.json(outcome.detail);
    } catch (err) {
      console.error("Bola paneli xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getChildDetail };
}

module.exports = { createParentChildDetailController };
