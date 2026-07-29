const {
  createStudentExamAttemptSubmitService,
} = require("../services/studentExamAttemptSubmitService");

function createStudentExamAttemptSubmitController({ pool, gradeAttempt }) {
  const service = createStudentExamAttemptSubmitService({ pool, gradeAttempt });

  async function submitAttempt(req, res) {
    try {
      const studentId = req.user.id;
      const attemptId = parseInt(req.params.attemptId, 10);
      if (isNaN(attemptId)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const outcome = await service.submitAttempt({
        attemptId,
        studentId,
        body: req.body,
      });
      if (outcome.status === "attempt-not-found") {
        return res.status(404).json({ error: "Urinish topilmadi" });
      }
      if (outcome.status === "already-finished") {
        return res.status(400).json({ error: "Allaqachon yakunlangan" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Imtihon submit xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { submitAttempt };
}

module.exports = { createStudentExamAttemptSubmitController };
