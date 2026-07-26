function createAdminQuestionUpdateController({ pool, logAudit, logger = console }) {
  return {
    async update(req, res) {
      try {
        const {
          id,
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

        if (!id) return res.status(400).json({ error: "Savol ID kerak" });
        if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
          return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
        }
        if (!["A", "B", "C", "D"].includes(correct_option)) {
          return res.status(400).json({ error: "To'g'ri javob A, B, C yoki D bo'lishi kerak" });
        }

        var st = status || "published";
        if (!["published", "draft", "needs_review"].includes(st)) st = "published";

        const result = await pool.query(
          `UPDATE questions SET
             question_text = $1, option_a = $2, option_b = $3, option_c = $4, option_d = $5,
             correct_option = $6, cefr_level = $7, skill = $8, explanation = $9, status = $10,
             updated_at = NOW()
           WHERE id = $11 RETURNING id`,
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
            id,
          ]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Savol topilmadi" });
        }

        await logAudit(req, "question_updated", {
          entityType: "question",
          entityId: id,
          details: (cefr_level || "A1") + " · " + (skill || "grammar"),
        });
        res.json({ message: "Savol yangilandi!", id: id });
      } catch (error) {
        logger.error("Savol tahrirlash xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionUpdateController };
