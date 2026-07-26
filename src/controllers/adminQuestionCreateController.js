function createAdminQuestionCreateController({ pool, logAudit, logger = console }) {
  return {
    async create(req, res) {
      try {
        const {
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          correct_option,
          cefr_level,
          skill,
          explanation,
          status,
        } = req.body;

        if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
          return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
        }
        if (!["A", "B", "C", "D"].includes(correct_option)) {
          return res.status(400).json({ error: "To'g'ri javob A, B, C yoki D bo'lishi kerak" });
        }

        var st = status || "published";
        if (!["published", "draft", "needs_review"].includes(st)) st = "published";

        const result = await pool.query(
          `INSERT INTO questions
           (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'easy', $9, $10)
           RETURNING id`,
          [
            question_text,
            option_a,
            option_b,
            option_c,
            option_d,
            correct_option,
            cefr_level || "A1",
            skill || "grammar",
            explanation || "",
            st,
          ]
        );

        var newId = result.rows[0].id;
        await logAudit(req, "question_created", {
          entityType: "question",
          entityId: newId,
          details: (cefr_level || "A1") + " · " + (skill || "grammar"),
        });

        res.json({ message: "Savol qo'shildi!", id: newId });
      } catch (error) {
        logger.error("Savol qo'shish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionCreateController };
