const {
  createUserPublicProfileService,
} = require("../services/userPublicProfileService");

function createUserPublicProfileController({ pool, logger = console }) {
  const service = createUserPublicProfileService({ pool });

  return {
    async getProfile(req, res) {
      try {
        const profile = await service.getProfile(req.params.userId, req.user.id);
        if (!profile) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }
        res.json(profile);
      } catch (error) {
        logger.error("Profil xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createUserPublicProfileController };
