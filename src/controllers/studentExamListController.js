const {
  createStudentExamListService,
} = require("../services/studentExamListService");

function createStudentExamListController({ pool }) {
  const service = createStudentExamListService({ pool });

  async function listExams(req, res) {
    try {
      const exams = await service.listExams(req.user.id);
      return res.json({ exams });
    } catch (err) {
      console.error("Student exams ro'yxati xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listExams };
}

module.exports = { createStudentExamListController };
