const {
  createStudentExamStartService,
} = require("../services/studentExamStartService");

function createStudentExamStartController({ pool, gradeAttempt }) {
  const service = createStudentExamStartService({ pool, gradeAttempt });

  async function startExam(req, res) {
    try {
      const studentId = req.user.id;
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const outcome = await service.startExam({ examId, studentId });
      if (outcome.status === "exam-not-found") {
        return res.status(404).json({ error: "Imtihon topilmadi yoki sizga ochiq emas" });
      }
      if (outcome.status === "exam-inactive") {
        return res.status(400).json({ error: "Imtihon hozir faol emas" });
      }
      if (outcome.status === "attempt-expired") {
        return res.status(409).json({ error: "Oldingi urinish vaqti tugagan", expired: true });
      }
      if (outcome.status === "attempts-exhausted") {
        return res.status(403).json({ error: "Urinishlar tugagan (maksimal " + outcome.maxAttempts + " marta)" });
      }

      return res.json(outcome.response);
    } catch (err) {
      console.error("Imtihon start xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { startExam };
}

module.exports = { createStudentExamStartController };
