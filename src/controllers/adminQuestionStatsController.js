function createAdminQuestionStatsController({ pool, logger = console }) {
  return {
    async getStats(req, res) {
      try {
        const result = await pool.query(
          "SELECT cefr_level, skill, status FROM questions"
        );
        const rows = result.rows;

        var levels = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
        var skills = {};
        var status = { published: 0, draft: 0, needs_review: 0 };

        rows.forEach(function (q) {
          if (levels[q.cefr_level] != null) levels[q.cefr_level]++;
          var sk = q.skill || "grammar";
          skills[sk] = (skills[sk] || 0) + 1;
          var st = q.status || "published";
          if (status[st] != null) status[st]++;
        });

        var mostLevel = null;
        var leastLevel = null;
        var maxC = -1;
        var minC = Infinity;
        Object.keys(levels).forEach(function (lv) {
          if (levels[lv] > maxC) {
            maxC = levels[lv];
            mostLevel = lv;
          }
          if (levels[lv] < minC) {
            minC = levels[lv];
            leastLevel = lv;
          }
        });

        var mostSkill = null;
        var maxSk = -1;
        Object.keys(skills).forEach(function (sk) {
          if (skills[sk] > maxSk) {
            maxSk = skills[sk];
            mostSkill = sk;
          }
        });

        res.json({
          totalQuestions: rows.length,
          levels: levels,
          skills: skills,
          status: status,
          mostCommonLevel: mostLevel,
          leastCoveredLevel: leastLevel,
          mostCommonSkill: mostSkill,
        });
      } catch (error) {
        logger.error("Stats xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionStatsController };
