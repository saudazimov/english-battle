function createAdminSchoolStudentListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        var school = (req.query.school || "").trim();
        var region = (req.query.region || "").trim();
        var district = (req.query.district || "").trim();
        if (!school) {
          return res.status(400).json({ error: "Maktab nomi kerak" });
        }

        var conds = ["school = $1"];
        var params = [school];
        var p = 1;
        if (region && region !== "—") {
          p++;
          conds.push("region = $" + p);
          params.push(region);
        }
        if (district && district !== "—") {
          p++;
          conds.push("district = $" + p);
          params.push(district);
        }

        var result = await pool.query(
          "SELECT id, first_name, last_name, role, cefr_level, rating, is_banned " +
            "FROM users WHERE " +
            conds.join(" AND ") +
            " ORDER BY rating DESC LIMIT 100",
          params
        );
        res.json({ school: school, students: result.rows });
      } catch (error) {
        logger.error("Maktab o'quvchilari xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminSchoolStudentListController };
