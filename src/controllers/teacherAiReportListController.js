function mapReportRow(r) {
  const confPct = { high: 93, medium: 88, low: 78 };
  const targetName =
    ((r.target_first || "") + " " + (r.target_last || "")).trim() || null;
  let title = null;
  let className = null;
  let skill = null;
  try {
    const out =
      typeof r.ai_output === "string" ? JSON.parse(r.ai_output) : r.ai_output;
    if (out) {
      title = out.title || null;
      className = out.class_name || null;
      skill = out.skill || null;
    }
  } catch (error) {
    // Invalid legacy ai_output is expected; preserve null metadata fallbacks.
  }

  return {
    id: r.id,
    report_type: r.report_type,
    confidence: r.confidence || "medium",
    accuracy_pct: confPct[r.confidence || "medium"] || 85,
    status: r.status,
    created_at: r.created_at,
    period_start: r.period_start,
    period_end: r.period_end,
    target_name: targetName,
    title: title,
    class_name: className,
    skill: skill,
  };
}

function buildReportStats(reports) {
  const total = reports.length;
  const avgAccuracy =
    total > 0
      ? Math.round(
          reports.reduce((a, r) => a + (r.accuracy_pct || 0), 0) / total
        )
      : null;
  const studentSet = new Set();
  reports.forEach((r) => {
    if (r.target_name) studentSet.add(r.target_name);
  });
  const studentsAnalyzed = studentSet.size;

  const classCount = {};
  reports.forEach((r) => {
    if (r.class_name) {
      classCount[r.class_name] = (classCount[r.class_name] || 0) + 1;
    }
  });
  let topClass = null;
  let topClassCount = 0;
  Object.keys(classCount).forEach((key) => {
    if (classCount[key] > topClassCount) {
      topClass = key;
      topClassCount = classCount[key];
    }
  });
  const timeSaved =
    total > 0 ? Math.round(((total * 45) / 60) * 10) / 10 : null;

  return {
    total: total,
    avg_accuracy: avgAccuracy,
    students_analyzed: studentsAnalyzed,
    top_class: topClass,
    top_class_count: topClassCount,
    time_saved: timeSaved,
  };
}

function createTeacherAiReportListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        const teacherId = req.user.id;
        const result = await pool.query(
          `SELECT r.id, r.report_type, r.audience, r.period_start, r.period_end,
                  r.confidence, r.status, r.created_at, r.target_student_id,
                  r.ai_output,
                  tu.first_name AS target_first, tu.last_name AS target_last
           FROM ai_reports r
           LEFT JOIN users tu ON tu.id = r.target_student_id
           WHERE r.user_id = $1 AND r.audience = 'teacher'
           ORDER BY r.created_at DESC
           LIMIT 200`,
          [teacherId]
        );

        const reports = result.rows.map(mapReportRow);
        res.json({ reports, stats: buildReportStats(reports) });
      } catch (error) {
        logger.error("/teacher/ai-reports xatosi:", error);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = {
  buildReportStats,
  createTeacherAiReportListController,
  mapReportRow,
};
