const {
  SCHEMA_VERSION,
  sourceSnapshotHash,
  createStudentReportCacheService,
} = require("../services/studentReportCacheService");

function createStudentWeeklyAiReportController({
  pool,
  aiSnapshot,
  aiService,
  reportCacheService,
  logger = console,
}) {
  const reportCache = reportCacheService || createStudentReportCacheService(pool);
  function periodConfig(query) {
    const requested = query && query.period;
    const key = requested === "today" || requested === "30d" ? requested : "7d";
    return {
      key,
      days: key === "today" ? 1 : key === "30d" ? 30 : 7,
      reportType: `student_learning_analysis_${key}_v4`,
    };
  }

  function parseSnapshot(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch (error) { return {}; }
  }

  function periodLearningDiagnostics(diagnostics = {}) {
    return {
      topics: diagnostics.topics || [],
      priority_topics: diagnostics.priority_topics || [],
      strongest_topics: diagnostics.strongest_topics || [],
      analyzed_answers: diagnostics.analyzed_answers || 0,
      sources: diagnostics.sources || {},
      coverage_note: diagnostics.coverage_note || "",
    };
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
      learning_diagnostics: periodLearningDiagnostics(snapshot.learning_diagnostics),
      data_quality: snapshot.data_quality || {},
    };
  }

  function learningOnlySnapshot(snapshot) {
    const student = snapshot.student || {};
    const analysis = publicAnalysis(snapshot);
    return {
      student: { cefr_level: student.cefr_level },
      period: snapshot.period || {},
      activity: analysis.activity,
      performance: analysis.performance,
      learning_diagnostics: analysis.learning_diagnostics,
      assignments: snapshot.assignments || {},
      exams: snapshot.exams || {},
      data_quality: analysis.data_quality,
      snapshot_meta: {
        snapshot_version: "student_learning_snapshot_v3",
        report_schema_version: SCHEMA_VERSION,
      },
    };
  }

  function cachedPayload(cached, snapshot, periodKey, deduplicated = false) {
    const storedSnapshot = parseSnapshot(cached.input_snapshot);
    const effectiveSnapshot = Object.keys(storedSnapshot).length ? storedSnapshot : snapshot;
    return {
      report: cached.ai_output,
      analysis: publicAnalysis(effectiveSnapshot),
      period: periodKey,
      data_quality: effectiveSnapshot.data_quality || {},
      cached: true,
      generation_deduplicated: deduplicated,
      confidence: cached.confidence,
      status: cached.status,
      created_at: cached.created_at,
    };
  }

  return {
    async generate(req, res) {
      let jobId = null;
      try {
        const studentId = req.user.id;
        const config = periodConfig(req.query);
        const period = aiSnapshot.recentPeriod(config.days);
        const rawSnapshot = await aiSnapshot.buildStudentWeeklySnapshot(
          studentId,
          period.start,
          period.end
        );
        const snapshot = learningOnlySnapshot(rawSnapshot);
        const snapshotHash = sourceSnapshotHash(snapshot);
        const cacheKey = {
          studentId,
          reportType: config.reportType,
          periodStart: period.start,
          snapshotHash,
        };
        const cached = await reportCache.findCached(cacheKey);
        if (cached && req.query.refresh !== "1") {
          return res.json(cachedPayload(cached, snapshot, config.key));
        }

        const lease = await reportCache.acquireGeneration({
          ...cacheKey,
          periodEnd: period.end,
        });
        jobId = lease.jobId || null;
        if (!lease.acquired) {
          const generated = await reportCache.waitForGeneratedReport(cacheKey);
          if (generated) {
            return res.json(cachedPayload(generated, snapshot, config.key, true));
          }
          return res.status(503).json({
            error: "Hisobot yaratilmoqda. Bir necha soniyadan keyin qayta urinib ko'ring.",
          });
        }

        const result = await aiService.generateStudentWeeklyReport(snapshot);
        const saved = await reportCache.saveReport({
          studentId,
          reportType: config.reportType,
          periodStart: period.start,
          periodEnd: period.end,
          snapshot,
          snapshotHash,
          result,
          jobId,
        });
        if (result.usage) {
          try {
            await pool.query(
              `INSERT INTO ai_usage_logs (user_id, report_id, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5)`,
              [
                studentId,
                saved.id,
                result.model,
                result.usage.input,
                result.usage.output,
              ]
            );
          } catch (usageError) {
            logger.error("Student AI usage log xatosi:", usageError.message);
          }
        }
        res.json({
          report: result.report,
          analysis: publicAnalysis(snapshot),
          period: config.key,
          data_quality: snapshot.data_quality,
          cached: false,
          confidence: result.confidence,
          status: result.status,
          created_at: saved.created_at,
        });
      } catch (error) {
        if (jobId) {
          try {
            await reportCache.failGeneration(jobId, error);
          } catch (jobError) {
            logger.error("Student AI job status xatosi:", jobError.message);
          }
        }
        logger.error("Student AI report xatosi:", error.message);
        res.status(500).json({
          error: "Hozir hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
        });
      }
    },
  };
}

module.exports = { createStudentWeeklyAiReportController };
