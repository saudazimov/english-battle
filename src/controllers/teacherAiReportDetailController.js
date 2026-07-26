function createTeacherAiReportDetailController({ pool, logger = console }) {
  return {
    async getById(req, res) {
      try {
        const teacherId = req.user.id;
        const reportId = parseInt(req.params.id, 10);
        if (isNaN(reportId)) {
          return res.status(400).json({ error: "Noto'g'ri ID" });
        }

        const result = await pool.query(
          `SELECT id, report_type, audience, ai_output, confidence, status,
                  period_start, period_end, created_at
           FROM ai_reports
           WHERE id = $1 AND user_id = $2 AND audience = 'teacher'`,
          [reportId, teacherId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Hisobot topilmadi" });
        }

        const r = result.rows[0];
        let aiOutput = r.ai_output;
        if (typeof aiOutput === "string") {
          try {
            aiOutput = JSON.parse(aiOutput);
          } catch (error) {}
        }

        res.json({
          id: r.id,
          report_type: r.report_type,
          ai_output: aiOutput,
          confidence: r.confidence,
          status: r.status,
          period_start: r.period_start,
          period_end: r.period_end,
          created_at: r.created_at,
        });
      } catch (error) {
        logger.error("/teacher/ai-reports/:id xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createTeacherAiReportDetailController };
