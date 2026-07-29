const {
  createSchoolBattleRankingsService,
} = require("../services/schoolBattleRankingsService");

function createSchoolBattleRankingsController({ pool, currentSeason, logger = console }) {
  const service = createSchoolBattleRankingsService({ pool, currentSeason });

  return {
    async rankings(req, res) {
      try {
        res.json(await service.getRankings(req.user.id, req.query));
      } catch (error) {
        logger.error("School rankings xato:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },

    async mySchool(req, res) {
      try {
        res.json(await service.getMySchool(req.user.id));
      } catch (error) {
        logger.error("School my xato:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createSchoolBattleRankingsController };
