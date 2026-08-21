const VALID_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const VALID_COUNTS = new Set([5, 10, 15, 20]);

function normalizeOptions(query) {
  const level = typeof query.level === "string" ? query.level.toUpperCase() : "";
  const count = Number(query.count);

  if (!VALID_LEVELS.has(level) || !VALID_COUNTS.has(count)) return null;
  return { level, count, skill: "grammar" };
}

function normalizeWordOptions(query) {
  const level = typeof query.level === "string" ? query.level.toUpperCase() : "";
  const count = Number(query.count);

  if (!VALID_LEVELS.has(level) || !VALID_COUNTS.has(count)) return null;
  return { level, count };
}

function createSmartboardQuestionService({ pool }) {
  return {
    async list(query) {
      const options = normalizeOptions(query || {});
      if (!options) return { status: "invalid" };

      const result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d,
                correct_option, explanation, skill, cefr_level
         FROM questions
         WHERE cefr_level = $1
           AND LOWER(skill) = $2
           AND UPPER(correct_option) IN ('A', 'B', 'C', 'D')
           AND question_text IS NOT NULL
           AND option_a IS NOT NULL
           AND option_b IS NOT NULL
           AND option_c IS NOT NULL
           AND option_d IS NOT NULL
         ORDER BY RANDOM()
         LIMIT $3`,
        [options.level, options.skill, options.count]
      );

      if (result.rows.length < options.count) {
        return {
          status: "insufficient",
          available: result.rows.length,
          required: options.count,
        };
      }

      return {
        status: "ok",
        level: options.level,
        skill: options.skill,
        questions: result.rows.map((question) => ({
          ...question,
          correct_option: String(question.correct_option).toUpperCase(),
        })),
      };
    },

    async listWords(query) {
      const options = normalizeWordOptions(query || {});
      if (!options) return { status: "invalid" };

      const result = await pool.query(
        `SELECT id, question_text, answer, explanation, skill, cefr_level
         FROM (
           SELECT id, question_text, explanation, skill, cefr_level,
                  CASE UPPER(correct_option)
                    WHEN 'A' THEN option_a WHEN 'B' THEN option_b
                    WHEN 'C' THEN option_c WHEN 'D' THEN option_d
                  END AS answer
           FROM questions
           WHERE cefr_level = $1
             AND UPPER(correct_option) IN ('A', 'B', 'C', 'D')
             AND question_text IS NOT NULL
         ) AS candidates
         WHERE answer ~ '^[A-Za-z]{2,16}$'
         ORDER BY RANDOM()
         LIMIT $2`,
        [options.level, options.count]
      );

      if (result.rows.length < options.count) {
        return {
          status: "insufficient",
          available: result.rows.length,
          required: options.count,
        };
      }

      return {
        status: "ok",
        level: options.level,
        words: result.rows.map((row) => ({ ...row, answer: String(row.answer).toLowerCase() })),
      };
    },
  };
}

module.exports = {
  createSmartboardQuestionService,
  normalizeOptions,
  normalizeWordOptions,
};
