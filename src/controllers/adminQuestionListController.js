function createAdminQuestionListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        var page = Math.max(1, parseInt(req.query.page) || 1);
        var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        var offset = (page - 1) * limit;

        var search = (req.query.search || "").trim();
        var level = (req.query.level || "").trim();
        var skill = (req.query.skill || "").trim();
        var status = (req.query.status || "").trim();
        var dateFrom = (req.query.date_from || "").trim();
        var dateTo = (req.query.date_to || "").trim();
        var conds = [];
        var params = [];
        var p = 0;

        if (search) {
          p++;
          conds.push("(LOWER(question_text) LIKE $" + p + " OR CAST(id AS TEXT) LIKE $" + p + ")");
          params.push("%" + search.toLowerCase() + "%");
        }
        if (level) {
          p++;
          conds.push("cefr_level = $" + p);
          params.push(level);
        }
        if (skill) {
          p++;
          conds.push("skill = $" + p);
          params.push(skill);
        }
        if (status) {
          p++;
          conds.push("status = $" + p);
          params.push(status);
        }
        if (dateFrom) {
          p++;
          conds.push("created_at >= $" + p);
          params.push(dateFrom);
        }
        if (dateTo) {
          p++;
          conds.push("created_at <= $" + p);
          params.push(dateTo + " 23:59:59");
        }

        var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";
        var countResult = await pool.query(
          "SELECT COUNT(*) AS total FROM questions " + whereClause,
          params
        );
        var total = parseInt(countResult.rows[0].total);
        var dataParams = params.slice();
        dataParams.push(limit);
        var limitIdx = dataParams.length;
        dataParams.push(offset);
        var offsetIdx = dataParams.length;

        var dataResult = await pool.query(
          "SELECT id, question_text, option_a, option_b, option_c, option_d, " +
            "correct_option, cefr_level, skill, difficulty, explanation, status, created_at, updated_at, " +
            "analysis_status, diagnostic_eligible, analysis_version, " +
            "(SELECT analysis_confidence FROM question_ai_analysis qa WHERE qa.question_id=questions.id) AS analysis_confidence " +
            "FROM questions " + whereClause +
            " ORDER BY id DESC LIMIT $" + limitIdx + " OFFSET $" + offsetIdx,
          dataParams
        );

        res.json({
          questions: dataResult.rows,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error("Admin savollar xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionListController };
