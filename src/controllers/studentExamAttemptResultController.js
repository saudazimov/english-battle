const {
  createStudentExamAttemptResultService,
} = require("../services/studentExamAttemptResultService");

function createStudentExamAttemptResultController({ pool }) {
  const service = createStudentExamAttemptResultService({ pool });

  async function getAttemptResult(req, res) {
    try {
      const studentId = req.user.id;
      const attemptId = parseInt(req.params.attemptId, 10);
      const result = await service.getAttemptResult(attemptId, studentId);
      if (!result) return res.status(404).json({ error: "Natija topilmadi" });

      return res.json({ result });
    } catch (err) {
      console.error("Natija xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getAttemptResult };
}

module.exports = { createStudentExamAttemptResultController };
