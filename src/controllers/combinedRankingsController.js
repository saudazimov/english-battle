const { createCombinedRankingsService } = require("../services/combinedRankingsService");

function createCombinedRankingsController({ pool, currentSeason, logger = console }) {
  const service = createCombinedRankingsService({ pool, currentSeason });
  return {
    async rankings(req, res) {
      try {
        res.json(await service.getRankings(req.user.id, req.query));
      } catch (error) {
        logger.error("Combined rankings xato:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createCombinedRankingsController };
