function createParentWeeklyAiReportService({
  pool,
  aiSnapshot,
  aiService,
  logger = console,
}) {
  async function generate(parentId, studentId, refresh) {
    const link = await pool.query(
      "SELECT id FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
      [parentId, studentId]
    );
    if (link.rows.length === 0) return { status: "forbidden" };

    const period = aiSnapshot.currentWeekPeriod();
    const cached = await pool.query(
      `SELECT id, ai_output, confidence, status, created_at
       FROM ai_reports
       WHERE target_student_id=$1 AND report_type='parent_weekly_report'
         AND period_start=$2
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, period.start]
    );
    if (cached.rows.length > 0 && refresh !== "1") {
      const report = cached.rows[0];
      return {
        status: "cached",
        result: {
          report: report.ai_output,
          cached: true,
          confidence: report.confidence,
          status: report.status,
          created_at: report.created_at,
        },
      };
    }

    const snapshot = await aiSnapshot.buildStudentWeeklySnapshot(
      studentId,
      period.start,
      period.end
    );
    const generated = await aiService.generateParentWeeklyReport(snapshot);
    const saved = await pool.query(
      `INSERT INTO ai_reports
        (user_id, target_student_id, report_type, audience, period_start, period_end,
         input_snapshot, ai_output, confidence, status)
       VALUES ($1,$2,'parent_weekly_report','parent',$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [
        parentId,
        studentId,
        period.start,
        period.end,
        JSON.stringify(snapshot),
        JSON.stringify(generated.report),
        generated.confidence,
        generated.status,
      ]
    );

    if (generated.usage) {
      pool.query(
        `INSERT INTO ai_usage_logs (user_id, report_id, model, input_tokens, output_tokens)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          parentId,
          saved.rows[0].id,
          generated.model,
          generated.usage.input,
          generated.usage.output,
        ]
      ).catch((error) => logger.error("AI usage log xato:", error.message));
    }

    return {
      status: "generated",
      result: {
        report: generated.report,
        data_quality: snapshot.data_quality,
        cached: false,
        confidence: generated.confidence,
        status: generated.status,
        created_at: saved.rows[0].created_at,
      },
    };
  }

  return { generate };
}

module.exports = { createParentWeeklyAiReportService };
