const {
  createSchoolProfileService,
} = require("../services/schoolProfileService");

function createSchoolProfileController({ pool, getSchoolAdmin, logger = console }) {
  const service = createSchoolProfileService({ pool, getSchoolAdmin });

  return {
    async profile(req, res) {
      try {
        const result = await service.getProfile(req.user.id);
        if (!result.ok) {
          return res.status(403).json({ error: result.error });
        }
        res.json(result.profile);
      } catch (error) {
        logger.error("School profile xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createSchoolProfileController };
