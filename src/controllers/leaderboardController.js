const { createLeaderboardService } = require("../services/leaderboardService");

function createLeaderboardController({ pool, logger = console }) {
  const service = createLeaderboardService({ pool });
  return {
    async leaderboard(req, res) {
      try {
        res.json(await service.getLeaderboard(req.user.id, req.query));
      } catch (error) {
        logger.error("Leaderboard xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },

    async myRanks(req, res) {
      try {
        res.json(await service.getMyRanks(req.user.id));
      } catch (error) {
        logger.error("My-ranks xato:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createLeaderboardController };
