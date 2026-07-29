const {
  createTeacherResultsAnalyticsService,
} = require("../services/teacherResultsAnalyticsService");

function createTeacherResultsAnalyticsController({ pool }) {
  const service = createTeacherResultsAnalyticsService({ pool });

  async function getResults(req, res) {
    try {
      const assignmentId = parseInt(req.params.assignmentId);
      if (!assignmentId) return res.status(400).json({ error: "Noto'g'ri ID" });

      const outcome = await service.getResults(assignmentId, req.user.id);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Topshiriq topilmadi" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("/teacher/results xatosi:", err);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getResults };
}

module.exports = { createTeacherResultsAnalyticsController };
