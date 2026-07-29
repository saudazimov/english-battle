const {
  createAdminAnalyticsReportService,
} = require("../services/adminAnalyticsReportService");

function createAdminAnalyticsReportController({ pool, logger = console }) {
  const service = createAdminAnalyticsReportService({ pool });
  return {
    async report(req, res) {
      try {
        let days = parseInt(req.query.days) || 30;
        if ([7, 30, 90].indexOf(days) === -1) days = 30;
        res.json(await service.getReport(days));
      } catch (error) {
        logger.error("Hisobotlar xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminAnalyticsReportController };
