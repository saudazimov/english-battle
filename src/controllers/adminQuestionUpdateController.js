const { createQuestionAnalysisService } = require("../services/questionAnalysisService");

function createAdminQuestionUpdateController({
  pool,
  logAudit,
  logger = console,
  questionAnalysisService = createQuestionAnalysisService({ pool, logger }),
}) {
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
        await questionAnalysisService.enqueueSafe(id, "question_updated");
        res.json({ message: "Savol yangilandi!", id: id });
      } catch (error) {
        logger.error("Savol tahrirlash xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },

    async getAnalysis(req, res) {
      try {
        const questionId = Number(req.params.id);
        if (!Number.isSafeInteger(questionId) || questionId < 1) {
          return res.status(400).json({ error: "Savol ID noto'g'ri" });
        }
        const analysis = await questionAnalysisService.getAnalysis(questionId);
        if (!analysis) return res.status(404).json({ error: "Tahlil topilmadi" });
        return res.json({ analysis });
      } catch (error) {
        logger.error("Savol AI tahlilini olish xatosi:", error.message);
        return res.status(500).json({ error: "Server xatosi" });
      }
    },

    async reviewAnalysis(req, res) {
      try {
        const questionId = Number(req.params.id);
        if (!Number.isSafeInteger(questionId) || questionId < 1) {
          return res.status(400).json({ error: "Savol ID noto'g'ri" });
        }
        const analysis = await questionAnalysisService.review(
          questionId,
          req.body || {},
          req.admin && req.admin.name
        );
        if (!analysis) return res.status(404).json({ error: "Tahlil topilmadi" });
        await logAudit(req, "question_analysis_reviewed", {
          entityType: "question",
          entityId: questionId,
          details: String((req.body && req.body.reason) || "Admin review").slice(0, 500),
        });
        return res.json({ message: "Savol tahlili yangilandi", analysis });
      } catch (error) {
        logger.error("Savol AI tahlilini ko'rib chiqish xatosi:", error.message);
        return res.status(500).json({ error: "Server xatosi" });
      }
    },

    async requeueAnalysis(req, res) {
      try {
        const questionId = Number(req.params.id);
        if (!Number.isSafeInteger(questionId) || questionId < 1) {
          return res.status(400).json({ error: "Savol ID noto'g'ri" });
        }
        const queued = await questionAnalysisService.enqueue(questionId, "admin_reanalysis");
        if (!queued) return res.status(404).json({ error: "Savol topilmadi" });
        setImmediate(() => questionAnalysisService.processBatchSafe(1));
        await logAudit(req, "question_analysis_requeued", {
          entityType: "question",
          entityId: questionId,
        });
        return res.json({ message: "Savol qayta tahlil navbatiga qo'shildi" });
      } catch (error) {
        logger.error("Savol AI tahlilini navbatga qo'yish xatosi:", error.message);
        return res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionUpdateController };
