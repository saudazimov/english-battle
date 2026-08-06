const {
  createUserProfileUpdateService,
} = require("../services/userProfileUpdateService");

function createUserProfileUpdateController({ pool, logger = console }) {
  const service = createUserProfileUpdateService({ pool });

  return {
    async updateProfile(req, res) {
      try {
        const outcome = await service.updateNames(req.user.id, req.body || {});
        if (outcome.status === "invalid") {
          return res.status(400).json({ error: outcome.error });
        }
        if (outcome.status === "not_found") {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }
        return res.json({ message: "Profil saqlandi", user: outcome.user });
      } catch (error) {
        logger.error("Profilni yangilash xatosi:", error.message);
        return res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createUserProfileUpdateController };
