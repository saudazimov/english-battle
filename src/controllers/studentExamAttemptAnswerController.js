const {
  createStudentExamAttemptAnswerService,
} = require("../services/studentExamAttemptAnswerService");

function createStudentExamAttemptAnswerController({ pool }) {
  const service = createStudentExamAttemptAnswerService({ pool });

  async function saveAnswer(req, res) {
    try {
      const studentId = req.user.id;
      const attemptId = parseInt(req.params.attemptId, 10);
      const { question_id: questionId, answer } = req.body;
      if (isNaN(attemptId) || !questionId) {
        return res.status(400).json({ error: "Noto'g'ri so'rov" });
      }

      const result = await service.saveAnswer({ attemptId, studentId, questionId, answer });
      if (result === "attempt-not-found") {
        return res.status(404).json({ error: "Urinish topilmadi" });
      }
      if (result === "exam-finished") {
        return res.status(400).json({ error: "Imtihon yakunlangan" });
      }
      if (result === "expired") {
        return res.status(400).json({ error: "Vaqt tugagan", expired: true });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("Javob saqlash xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { saveAnswer };
}

module.exports = { createStudentExamAttemptAnswerController };
