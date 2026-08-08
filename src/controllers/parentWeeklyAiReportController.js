const {
  createParentWeeklyAiReportService,
} = require("../services/parentWeeklyAiReportService");

function createParentWeeklyAiReportController(dependencies) {
  const service = createParentWeeklyAiReportService(dependencies);

  async function generate(req, res) {
    try {
      const studentId = Number(req.params.studentId);
      if (!Number.isSafeInteger(studentId) || studentId < 1) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const outcome = await service.generate(
        req.user.id,
        studentId,
        req.query.refresh
      );
      if (outcome.status === "forbidden") {
        return res.status(403).json({ error: "Bu farzandga ruxsatingiz yo'q" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Parent AI report xatosi:", err.message);
      return res.status(500).json({
        error: "Hozir AI hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
      });
    }
  }

  return { generate };
}

module.exports = { createParentWeeklyAiReportController };
