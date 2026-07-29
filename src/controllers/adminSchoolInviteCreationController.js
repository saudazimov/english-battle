const defaultSchoolInvite = require("../../schoolInvite");
const {
  normalizeSchool: defaultNormalizeSchool,
} = require("../utils/schoolNormalization");
const {
  schoolIdentityKey: defaultSchoolIdentityKey,
} = require("../utils/schoolIdentity");
const {
  createAdminSchoolInviteCreationService,
} = require("../services/adminSchoolInviteCreationService");

function createAdminSchoolInviteCreationController({
  pool,
  schoolInvite = defaultSchoolInvite,
  normalizeSchool = defaultNormalizeSchool,
  schoolIdentityKey = defaultSchoolIdentityKey,
  logger = console,
  now = () => Date.now(),
}) {
  const service = createAdminSchoolInviteCreationService({ pool, schoolInvite });

  return {
    async create(req, res) {
      try {
        const { school_name, region, district, expires_days } = req.body;

        if (!school_name || school_name.trim().length < 3) {
          return res.status(400).json({ error: "Maktab nomi majburiy (kamida 3 harf)" });
        }
        const schoolNorm = normalizeSchool(school_name);
        if (!schoolIdentityKey(region, district, schoolNorm)) {
          return res.status(400).json({ error: "Viloyat, tuman va maktab to'liq kiritilishi kerak" });
        }

        if (await service.activeInviteExists(schoolNorm, region.trim(), district.trim())) {
          return res.status(400).json({ error: "Bu maktab uchun faol kod allaqachon mavjud" });
        }
        if (await service.schoolAdminExists(schoolNorm, region.trim(), district.trim())) {
          return res.status(400).json({ error: "Bu maktabда allaqachon admin bor" });
        }

        const { rawCode, codeHash } = service.generateCode();
        const expiresAt = expires_days
          ? new Date(now() + expires_days * 24 * 60 * 60 * 1000)
          : new Date(now() + 30 * 24 * 60 * 60 * 1000);
        await service.insertInvite(
          codeHash,
          schoolNorm,
          region.trim(),
          district.trim(),
          req.user?.id || null,
          expiresAt
        );

        res.status(201).json({
          message: "Kod yaratildi. Maktab rahbariga bering (qayta ko'rsatilmaydi!)",
          code: rawCode,
          school_name: schoolNorm,
          expires_at: expiresAt
        });
      } catch (error) {
        logger.error("School invite yaratish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminSchoolInviteCreationController };
