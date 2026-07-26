function createParentAiReportListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        const parentId = req.user.id;
        const studentId = parseInt(req.params.studentId, 10);
        if (isNaN(studentId)) {
          return res.status(400).json({ error: "Noto'g'ri ID" });
        }

        const link = await pool.query(
          "SELECT id FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
          [parentId, studentId]
        );
        if (link.rows.length === 0) {
          return res.status(403).json({ error: "Ruxsat yo'q" });
        }

        const rows = await pool.query(
          `SELECT id, period_start, period_end, ai_output, confidence, status, created_at
           FROM ai_reports
           WHERE target_student_id=$1 AND report_type='parent_weekly_report'
           ORDER BY period_start DESC LIMIT 12`,
          [studentId]
        );
        res.json({ reports: rows.rows });
      } catch (error) {
        logger.error("AI hisobotlar ro'yxati xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createParentAiReportListController };
