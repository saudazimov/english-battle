function createAdminSchoolListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        var page = Math.max(1, parseInt(req.query.page) || 1);
        var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        var offset = (page - 1) * limit;
        var search = (req.query.search || "").trim();
        var region = (req.query.region || "").trim();

        var conds = ["school IS NOT NULL", "school != ''"];
        var params = [];
        var p = 0;
        if (search) {
          p++;
          conds.push("LOWER(school) LIKE $" + p);
          params.push("%" + search.toLowerCase() + "%");
        }
        if (region) {
          p++;
          conds.push("region = $" + p);
          params.push(region);
        }
        var whereClause = "WHERE " + conds.join(" AND ");

        var countResult = await pool.query(
          "SELECT COUNT(*) AS total FROM (SELECT school, region, district FROM users " +
            whereClause +
            " GROUP BY school, region, district) AS sub",
          params
        );
        var total = parseInt(countResult.rows[0].total);

        var dataParams = params.slice();
        dataParams.push(limit);
        var li = dataParams.length;
        dataParams.push(offset);
        var oi = dataParams.length;

        var dataResult = await pool.query(
          "SELECT school, region, district, " +
            "COUNT(*) AS student_count, " +
            "ROUND(AVG(rating)) AS avg_rating " +
            "FROM users " +
            whereClause +
            " GROUP BY school, region, district ORDER BY student_count DESC LIMIT $" +
            li +
            " OFFSET $" +
            oi,
          dataParams
        );

        res.json({
          schools: dataResult.rows.map(function (r) {
            return {
              name: r.school,
              studentCount: parseInt(r.student_count),
              avgRating: r.avg_rating != null ? parseInt(r.avg_rating) : 0,
              region: r.region || "—",
              district: r.district || "—",
            };
          }),
          pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error("Maktablar xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminSchoolListController };
