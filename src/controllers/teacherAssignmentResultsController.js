const {
  createTeacherAssignmentResultsService,
} = require("../services/teacherAssignmentResultsService");

function createTeacherAssignmentResultsController({ pool }) {
  const service = createTeacherAssignmentResultsService({ pool });

  async function getResults(req, res) {
    try {
      const assignmentId = parseInt(req.params.id, 10);
      if (isNaN(assignmentId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const outcome = await service.getResults(assignmentId, req.user.id);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Topshiriq topilmadi" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Topshiriq natijalari xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getResults };
}

module.exports = { createTeacherAssignmentResultsController };
