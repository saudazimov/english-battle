const {
  createTeacherExamDeleteService,
} = require("../services/teacherExamDeleteService");

function createTeacherExamDeleteController({ pool, logAudit }) {
  const service = createTeacherExamDeleteService({ pool });

  async function deleteExam(req, res) {
    try {
      const teacherId = req.user.id;
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const deleted = await service.deleteExam(examId, teacherId);
      if (!deleted) return res.status(404).json({ error: "Imtihon topilmadi" });

      if (typeof logAudit === "function") {
        logAudit(req, "exam_deleted", { entityType: "exam", entityId: examId });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("Imtihon o'chirish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { deleteExam };
}

module.exports = { createTeacherExamDeleteController };
