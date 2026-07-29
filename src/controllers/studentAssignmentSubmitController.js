const {
  createStudentAssignmentSubmitService,
} = require("../services/studentAssignmentSubmitService");

function createStudentAssignmentSubmitController({ pool }) {
  const service = createStudentAssignmentSubmitService({ pool });

  async function submitAssignment(req, res) {
    const studentId = req.user.id;
    const assignmentId = parseInt(req.params.id, 10);
    if (isNaN(assignmentId)) return res.status(400).json({ error: "Noto'g'ri ID" });
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

    try {
      const outcome = await service.submitAssignment({ assignmentId, studentId, answers });
      if (outcome.status === "assignment-not-found") {
        return res.status(404).json({ error: "Topshiriq topilmadi" });
      }
      if (outcome.status === "already-submitted") {
        return res.status(409).json({ error: "Bu topshiriq allaqachon topshirilgan" });
      }
      return res.json({ success: true, result: outcome.result, review: outcome.review });
    } catch (err) {
      console.error("Topshiriq topshirish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { submitAssignment };
}

module.exports = { createStudentAssignmentSubmitController };
