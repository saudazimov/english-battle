function createAdminQuestionHealthController({ pool, logger = console }) {
  return {
    async getHealth(req, res) {
      try {
        const result = await pool.query(
          `SELECT id, question_text, option_a, option_b, option_c, option_d,
                  correct_option, cefr_level, skill, status FROM questions`
        );
        const rows = result.rows;

        var total = rows.length;
        var valid = 0;
        var missingFields = 0;
        var invalidAnswerKey = 0;
        var published = 0;
        var draft = 0;
        var needsReview = 0;
        var validStatuses = ["published", "draft", "needs_review"];
        var validAnswers = ["A", "B", "C", "D"];
        var seen = {};
        var duplicateRisk = 0;

        rows.forEach(function (q) {
          var st = q.status || "published";
          if (st === "published") published++;
          else if (st === "draft") draft++;
          else if (st === "needs_review") needsReview++;

          var hasAllFields =
            q.question_text &&
            q.question_text.trim().length >= 3 &&
            q.option_a &&
            q.option_a.trim() &&
            q.option_b &&
            q.option_b.trim() &&
            q.option_c &&
            q.option_c.trim() &&
            q.option_d &&
            q.option_d.trim() &&
            q.cefr_level &&
            q.skill;

          var answerOk = validAnswers.indexOf(q.correct_option) > -1;
          var statusOk = validStatuses.indexOf(st) > -1;

          if (!hasAllFields) missingFields++;
          if (!answerOk) invalidAnswerKey++;

          var norm = (q.question_text || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ");
          if (norm) {
            if (seen[norm]) duplicateRisk++;
            else seen[norm] = true;
          }

          if (hasAllFields && answerOk && statusOk) valid++;
        });

        var score = total > 0 ? Math.round((valid / total) * 1000) / 10 : 0;

        res.json({
          totalQuestions: total,
          validQuestions: valid,
          validationScore: score,
          missingFields: missingFields,
          invalidAnswerKey: invalidAnswerKey,
          duplicateRisk: duplicateRisk,
          needsReview: needsReview,
          published: published,
          draft: draft,
        });
      } catch (error) {
        logger.error("Health xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionHealthController };
