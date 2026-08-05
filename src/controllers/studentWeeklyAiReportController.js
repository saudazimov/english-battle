function createStudentWeeklyAiReportController({
  pool,
  aiSnapshot,
  aiService,
  logger = console,
}) {
  function periodConfig(query) {
    const requested = query && query.period;
    const key = requested === "today" || requested === "30d" ? requested : "7d";
    return {
      key,
      days: key === "today" ? 1 : key === "30d" ? 30 : 7,
      reportType: `student_learning_analysis_${key}_v3`,
    };
  }

  function parseSnapshot(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch (error) { return {}; }
  }

  function publicAnalysis(snapshot) {
    const activity = snapshot.activity || {};
    const performance = snapshot.performance || {};
    return {
      period: snapshot.period || {},
      activity: {
        questions_answered: activity.questions_answered || 0,
        assignments_completed: activity.assignments_completed || 0,
        exams_taken: activity.exams_taken || 0,
        active_days: activity.active_days || 0,
      },
      performance: {
        accuracy: performance.accuracy || 0,
        correct_count: performance.correct_count || 0,
        wrong_count: performance.wrong_count || 0,
        timeout_count: performance.timeout_count || 0,
      },
      learning_diagnostics: snapshot.learning_diagnostics || {},
      data_quality: snapshot.data_quality || {},
    };
  }

  function learningOnlySnapshot(snapshot) {
    const student = snapshot.student || {};
    const analysis = publicAnalysis(snapshot);
    return {
      student: {
        id: student.id,
        name: student.name,
        cefr_level: student.cefr_level,
      },
      period: snapshot.period || {},
      activity: analysis.activity,
      performance: analysis.performance,
      learning_diagnostics: analysis.learning_diagnostics,
      assignments: snapshot.assignments || {},
      exams: snapshot.exams || {},
      data_quality: analysis.data_quality,
    };
  }

  return {
    async generate(req, res) {
      try {
        const studentId = req.user.id;
        const config = periodConfig(req.query);
        const period = aiSnapshot.recentPeriod(config.days);

        const cached = await pool.query(
          `SELECT ai_output, input_snapshot, confidence, status, created_at FROM ai_reports
           WHERE target_student_id=$1 AND report_type=$2 AND period_start=$3
           ORDER BY created_at DESC LIMIT 1`,
          [studentId, config.reportType, period.start]
        );
        if (cached.rows.length > 0 && req.query.refresh !== "1") {
          const c = cached.rows[0];
          const snapshot = parseSnapshot(c.input_snapshot);
          return res.json({
            report: c.ai_output,
            analysis: publicAnalysis(snapshot),
            period: config.key,
            cached: true,
            confidence: c.confidence,
            status: c.status,
            created_at: c.created_at,
          });
        }

        const rawSnapshot = await aiSnapshot.buildStudentWeeklySnapshot(
          studentId,
          period.start,
          period.end
        );
        const snapshot = learningOnlySnapshot(rawSnapshot);
        const result = await aiService.generateStudentWeeklyReport(snapshot);

        const saved = await pool.query(
          `INSERT INTO ai_reports (user_id, target_student_id, report_type, audience, period_start, period_end, input_snapshot, ai_output, confidence, status)
           VALUES ($1,$1,$2,'student',$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
          [
            studentId,
            config.reportType,
            period.start,
            period.end,
            JSON.stringify(snapshot),
            JSON.stringify(result.report),
            result.confidence,
            result.status,
          ]
        );
        if (result.usage) {
          pool
            .query(
              `INSERT INTO ai_usage_logs (user_id, report_id, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5)`,
              [
                studentId,
                saved.rows[0].id,
                result.model,
                result.usage.input,
                result.usage.output,
              ]
            )
            .catch(() => {});
        }
        res.json({
          report: result.report,
          analysis: publicAnalysis(snapshot),
          period: config.key,
          data_quality: snapshot.data_quality,
          cached: false,
          confidence: result.confidence,
          status: result.status,
          created_at: saved.rows[0].created_at,
        });
      } catch (error) {
        logger.error("Student AI report xatosi:", error.message);
        res.status(500).json({
          error: "Hozir hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
        });
      }
    },
  };
}

module.exports = { createStudentWeeklyAiReportController };
