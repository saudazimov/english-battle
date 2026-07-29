const {
  createTeacherExamListService,
} = require("../services/teacherExamListService");

function createTeacherExamListController({ pool }) {
  const service = createTeacherExamListService({ pool });

  async function listExams(req, res) {
    try {
      const result = await service.listExams(req.user.id);
      return res.json(result);
    } catch (err) {
      console.error("Imtihonlar ro'yxati xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listExams };
}

module.exports = { createTeacherExamListController };
