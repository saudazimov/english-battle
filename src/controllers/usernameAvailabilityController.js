const {
  createUsernameAvailabilityService,
} = require("../services/usernameAvailabilityService");

function createUsernameAvailabilityController({
  pool,
  usernameRegex,
  logger = console,
}) {
  const service = createUsernameAvailabilityService({ pool });

  return {
    async check(req, res) {
      try {
        let { username } = req.body;
        if (!username) {
          return res.status(400).json({ error: "Username kiritilmadi" });
        }
        username = String(username).toLowerCase().trim();

        if (!usernameRegex.test(username)) {
          return res.json({
            available: false,
            reason: "format",
            message: "Username 5-32 belgi bo'lishi va faqat a-z, 0-9, _ belgilaridan iborat bo'lishi kerak"
          });
        }

        const available = await service.isAvailable(username);
        res.json({
          available,
          message: available ? "Username bo'sh" : "Username band"
        });
      } catch (error) {
        logger.error("Username tekshirish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createUsernameAvailabilityController };
