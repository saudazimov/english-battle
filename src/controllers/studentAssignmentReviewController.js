const {
  createStudentAssignmentReviewService,
} = require("../services/studentAssignmentReviewService");

function createStudentAssignmentReviewController({ pool }) {
  const service = createStudentAssignmentReviewService({ pool });

  async function getReview(req, res) {
    try {
      const assignmentId = parseInt(req.params.id, 10);
      if (isNaN(assignmentId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const outcome = await service.getReview(assignmentId, req.user.id);
      if (outcome.status === "not-found") {
        return res.status(404).json({ error: "Topshiriq topilmadi" });
      }
      if (outcome.status === "not-submitted") {
        return res.status(409).json({ error: "Topshiriq hali topshirilmagan" });
      }

      return res.json(outcome.result);
    } catch (err) {
      console.error("Topshiriq review xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getReview };
}

module.exports = { createStudentAssignmentReviewController };
