const {
  createSchoolInviteVerificationService,
} = require("../services/schoolInviteVerificationService");

function createSchoolInviteVerificationController({
  pool,
  schoolInvite,
  logger = console,
}) {
  const service = createSchoolInviteVerificationService({ pool, schoolInvite });

  return {
    async verify(req, res) {
      try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Kod kiritilmadi" });

        const invite = await service.findInvite(code);
        if (!invite) {
          return res.status(400).json({ error: "Kod noto'g'ri" });
        }
        if (invite.used_by) {
          return res.status(400).json({ error: "Bu kod allaqachon ishlatilgan" });
        }
        if (invite.expires_at && new Date() > new Date(invite.expires_at)) {
          return res.status(400).json({ error: "Kod muddati tugagan" });
        }

        res.json({
          valid: true,
          school_name: invite.school_name,
          region: invite.region,
          district: invite.district
        });
      } catch (error) {
        logger.error("School code tekshirish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createSchoolInviteVerificationController };
