const { createExamSubmitService } = require("../services/examSubmitService");

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EXAM_ANSWERS = 100;

function createExamSubmitController({ pool, getNextLevel }) {
  const service = createExamSubmitService({ pool, getNextLevel });

  async function submitExam(req, res) {
    try {
      const userId = req.user.id;
      const { answers, session_id: sessionId } = req.body || {};
      if (
        typeof sessionId !== "string"
        || !SESSION_ID_PATTERN.test(sessionId)
        || !Array.isArray(answers)
        || answers.length > MAX_EXAM_ANSWERS
      ) {
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
