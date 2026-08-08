function createTeacherWeeklyAiReportController({
  pool,
  aiSnapshot,
  aiService,
  logger = console,
}) {
  return {
    async generate(req, res) {
      try {
        const teacherId = req.user.id;
        const classId = Number(req.params.classId);
        if (!Number.isSafeInteger(classId) || classId < 1) {
          return res.status(400).json({ error: "Noto'g'ri sinf ID" });
        }

        const own = await pool.query(
          "SELECT id FROM classes WHERE id=$1 AND teacher_id=$2 AND archived_at IS NULL",
          [classId, teacherId]
        );
        if (own.rows.length === 0) {
          return res.status(403).json({ error: "Bu sinf sizga tegishli emas" });
        }

        const period = aiSnapshot.currentWeekPeriod();
        const cached = await pool.query(
          `SELECT ai_output, confidence, status, created_at FROM ai_reports
           WHERE user_id=$1 AND report_type='teacher_class_report' AND period_start=$2
             AND input_snapshot->'class'->>'id' = $3
           ORDER BY created_at DESC LIMIT 1`,
          [teacherId, period.start, String(classId)]
        );
        if (cached.rows.length > 0 && req.query.refresh !== "1") {
          const c = cached.rows[0];
          return res.json({
            report: c.ai_output,
            cached: true,
            confidence: c.confidence,
            status: c.status,
            created_at: c.created_at,
          });
        }

        const snapshot = await aiSnapshot.buildTeacherClassSnapshot(
          teacherId,
          classId,
          period.start,
          period.end
        );
        const result = await aiService.generateTeacherClassReport(snapshot);

        const saved = await pool.query(
          `INSERT INTO ai_reports (user_id, target_student_id, report_type, audience, period_start, period_end, input_snapshot, ai_output, confidence, status)
           VALUES ($1,NULL,'teacher_class_report','teacher',$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
          [
            teacherId,
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
                teacherId,
                saved.rows[0].id,
                result.model,
                result.usage.input,
                result.usage.output,
              ]
            )
            .catch((usageError) => logger.error("Teacher AI usage log xatosi:", usageError.message));
        }
        res.json({
          report: result.report,
          data_quality: snapshot.data_quality,
          cached: false,
          confidence: result.confidence,
          status: result.status,
          created_at: saved.rows[0].created_at,
        });
      } catch (error) {
        logger.error("Teacher AI report xatosi:", error.message);
        res.status(500).json({
          error: "Hozir hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
        });
      }
    },
  };
}

module.exports = { createTeacherWeeklyAiReportController };
