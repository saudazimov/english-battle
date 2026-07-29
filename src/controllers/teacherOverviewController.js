const { createTeacherOverviewService } = require("../services/teacherOverviewService");

function createTeacherOverviewController({ pool }) {
  const service = createTeacherOverviewService({ pool });

  async function getOverview(req, res) {
    try {
      return res.json(await service.getOverview(req.user.id));
    } catch (err) {
      console.error("Teacher overview xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getOverview };
}

module.exports = { createTeacherOverviewController };
