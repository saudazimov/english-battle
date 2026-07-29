const {
  createTeacherExamDetailService,
} = require("../services/teacherExamDetailService");

function createTeacherExamDetailController({ pool }) {
  const service = createTeacherExamDetailService({ pool });

  async function getExamDetail(req, res) {
    try {
      const teacherId = req.user.id;
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const detail = await service.getExamDetail(examId, teacherId);
      if (!detail) return res.status(404).json({ error: "Imtihon topilmadi" });

      return res.json(detail);
    } catch (err) {
      console.error("Imtihon ko'rish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getExamDetail };
}

module.exports = { createTeacherExamDetailController };
