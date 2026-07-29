const {
  createStudentAssignmentStartService,
} = require("../services/studentAssignmentStartService");

function createStudentAssignmentStartController({ pool }) {
  const service = createStudentAssignmentStartService({ pool });

  async function startAssignment(req, res) {
    try {
      const assignmentId = parseInt(req.params.id, 10);
      if (isNaN(assignmentId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const outcome = await service.startAssignment(assignmentId, req.user.id);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Topshiriq topilmadi" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Topshiriqni boshlash xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { startAssignment };
}

module.exports = { createStudentAssignmentStartController };
