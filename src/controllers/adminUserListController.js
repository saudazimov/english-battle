function createAdminUserListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        var page = Math.max(1, parseInt(req.query.page) || 1);
        var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        var offset = (page - 1) * limit;

        var search = (req.query.search || "").trim();
        var role = (req.query.role || "").trim();
        var level = (req.query.level || "").trim();
        var region = (req.query.region || "").trim();

        var conds = [];
        var params = [];
        var p = 0;
        if (search) {
          p++;
          conds.push(
            "(LOWER(first_name) LIKE $" +
              p +
              " OR LOWER(last_name) LIKE $" +
              p +
              " OR phone LIKE $" +
              p +
              ")"
          );
          params.push("%" + search.toLowerCase() + "%");
        }
        if (role) {
          p++;
          conds.push("role = $" + p);
          params.push(role);
        }
        if (level) {
          p++;
          conds.push("cefr_level = $" + p);
          params.push(level);
        }
        if (region) {
          p++;
          conds.push("region = $" + p);
          params.push(region);
        }
        var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

        var countResult = await pool.query(
          "SELECT COUNT(*) AS total FROM users " + whereClause,
          params
        );
        var total = parseInt(countResult.rows[0].total);

        var dataParams = params.slice();
        dataParams.push(limit);
        var li = dataParams.length;
        dataParams.push(offset);
        var oi = dataParams.length;

        var dataResult = await pool.query(
          "SELECT id, first_name, last_name, role, cefr_level, rating, region, district, school, " +
            "phone, is_banned, created_at FROM users " +
            whereClause +
            " ORDER BY id DESC LIMIT $" +
            li +
            " OFFSET $" +
            oi,
          dataParams
        );

        res.json({
          users: dataResult.rows,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error("Admin users xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminUserListController };
