const { createExamSubmitService } = require("../services/examSubmitService");

function createExamSubmitController({ pool, getNextLevel }) {
  const service = createExamSubmitService({ pool, getNextLevel });

  async function submitExam(req, res) {
    try {
      const userId = req.user.id;
      const { answers, session_id: sessionId } = req.body;
      if (!sessionId || !answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: "Javoblar yuborilmadi" });
      }

      const result = await service.submitExam({ userId, sessionId, answers });
      if (result.statusCode !== 200) {
        return res.status(result.statusCode).json(result.body);
      }
      return res.json(result.body);
    } catch (err) {
      console.error("Imtihon submit xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { submitExam };
}

module.exports = { createExamSubmitController };
