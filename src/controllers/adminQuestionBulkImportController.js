const {
  createAdminQuestionBulkImportService,
} = require("../services/adminQuestionBulkImportService");

function createAdminQuestionBulkImportController({ pool, logAudit, questionAnalysisService }) {
  const service = createAdminQuestionBulkImportService({ pool, questionAnalysisService });

  async function importQuestions(req, res) {
    try {
      const outcome = await service.importRows(req.body.rows);
      if (outcome.status === "empty") {
        return res.status(400).json({ error: "Import uchun qatorlar yo'q" });
      }
      if (outcome.status === "too-many") {
        return res.status(400).json({ error: "Bir martada maksimal 1000 ta savol" });
      }

      await logAudit(req, "bulk_import_completed", {
        entityType: "question",
        details: outcome.inserted + " qo'shildi, " + outcome.skipped + " o'tkazib yuborildi",
      });
      return res.json({
        inserted: outcome.inserted,
        skipped: outcome.skipped,
        total: outcome.total,
        errors: outcome.errors,
      });
    } catch (err) {
      console.error("Bulk import xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { importQuestions };
}

module.exports = { createAdminQuestionBulkImportController };
