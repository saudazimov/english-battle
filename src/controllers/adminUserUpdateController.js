const {
  validateRegionDistrict: defaultValidateRegionDistrict,
} = require("../../regions");
const {
  normalizeSchool: defaultNormalizeSchool,
} = require("../utils/schoolNormalization");

function createAdminUserUpdateController({
  pool,
  logAudit,
  validateRegionDistrict = defaultValidateRegionDistrict,
  normalizeSchool = defaultNormalizeSchool,
  logger = console,
}) {
  return {
    async update(req, res) {
      try {
        const { id, region, district, school, cefr_level } = req.body;
        if (!id) {
          return res.status(400).json({ error: "Foydalanuvchi ID kerak" });
        }

        const regionCheck = validateRegionDistrict(region, district);
        if (!regionCheck.valid) {
          return res.status(400).json({ error: regionCheck.error });
        }

        var validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
        var lvl = cefr_level || "A1";
        if (validLevels.indexOf(lvl) === -1) lvl = "A1";

        var result = await pool.query(
          "UPDATE users SET region = $1, district = $2, school = $3, cefr_level = $4 WHERE id = $5 RETURNING first_name, last_name",
          [region, district, normalizeSchool(school), lvl, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }

        var name = result.rows[0].first_name + " " + result.rows[0].last_name;
        await logAudit(req, "user_updated", {
          entityType: "user",
          entityId: id,
          details: name + " — " + region + ", " + district,
        });
        res.json({ message: "Foydalanuvchi yangilandi" });
      } catch (error) {
        logger.error("Foydalanuvchi yangilash xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminUserUpdateController };
