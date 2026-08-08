const PROFILE_VERSION = "skill_profile_v1";
const { createPatternDetectionService } = require("./patternDetectionService");
const { createDurableJobService } = require("./durableJobService");

const DEFAULT_CONFIG = Object.freeze({
  mastery: {
    weighted_accuracy: 0.80, transfer_bonus_max: 6, format_variety_bonus_max: 4,
    delayed_retention_bonus_max: 5, stable_response_bonus_max: 5,
    hint_penalty_max: 6, repeated_error_penalty_max: 12,
    regression_penalty: 15, expected_response_time_ms: 20000,
  },
  confidence: {
    attempts_max: 30, unique_questions_max: 25, sessions_max: 15,
    formats_max: 10, analysis_quality_max: 10, recency_max: 5,
    consistency_max: 5, attempt_target: 20, question_target: 12,
    session_target: 6, format_target: 4,
  },
  evidence: {
    suspected_errors: 2, likely_errors: 3, likely_questions: 3,
    confirmed_errors: 3, confirmed_sessions: 2, confirmed_formats: 2,
    confirmed_confidence: 40, regression_recent_attempts: 5,
    regression_recent_accuracy: 50,
  },
  priority: {
    confidence_floor: 0.35, error_floor: 0.40, recurrence_floor: 0.40,
    prerequisite_default: 0.70, recency_decay_days: 45,
  },
});

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function ratio(value, target) {
  return Math.min(1, Math.max(0, Number(value) / Math.max(1, Number(target))));
}

function daysSince(value, now = new Date()) {
  if (!value) return Infinity;
  return Math.max(0, (now.getTime() - new Date(value).getTime()) / 86400000);
}

function confidenceLabel(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function calculateConfidence(stats, config = DEFAULT_CONFIG.confidence, now = new Date()) {
  const recency = daysSince(stats.lastAttempt, now) <= 14 ? 1 : Math.max(0, 1 - daysSince(stats.lastAttempt, now) / 90);
  const consistency = clamp(stats.consistency == null ? 0.5 : stats.consistency, 0, 1);
  const score =
    ratio(stats.exposures, config.attempt_target) * config.attempts_max +
    ratio(stats.distinctQuestions, config.question_target) * config.unique_questions_max +
    ratio(stats.sessions, config.session_target) * config.sessions_max +
    ratio(stats.formats, config.format_target) * config.formats_max +
    clamp(stats.analysisQuality, 0, 1) * config.analysis_quality_max +
    recency * config.recency_max + consistency * config.consistency_max;
  return Math.round(clamp(score) * 100) / 100;
}

function calculateMastery(stats, config = DEFAULT_CONFIG.mastery) {
  const weightedAccuracy = clamp(stats.weightedAccuracy);
  const transferBonus = ratio(stats.formats - 1, 3) * config.transfer_bonus_max;
  const varietyBonus = ratio(stats.distinctQuestions, 10) * config.format_variety_bonus_max;
  const retentionBonus = clamp(stats.retentionScore, 0, 100) / 100 * config.delayed_retention_bonus_max;
  const responseRatio = stats.averageResponseTimeMs && stats.expectedResponseTimeMs
    ? stats.expectedResponseTimeMs / stats.averageResponseTimeMs : 0;
  const responseBonus = weightedAccuracy >= 60 ? clamp(responseRatio, 0, 1) * config.stable_response_bonus_max : 0;
  const hintPenalty = clamp(stats.hintUsageRate, 0, 100) / 100 * config.hint_penalty_max;
  const repeatedPenalty = ratio(stats.repeatedMisconceptions, 5) * config.repeated_error_penalty_max;
  const regressionPenalty = stats.regressionFlag ? config.regression_penalty : 0;
  const score = weightedAccuracy * config.weighted_accuracy + transferBonus + varietyBonus
    + retentionBonus + responseBonus - hintPenalty - repeatedPenalty - regressionPenalty;
  return Math.round(clamp(score) * 100) / 100;
}

function determineEvidenceState(stats, previous = {}, config = DEFAULT_CONFIG.evidence) {
  if (stats.regressionFlag) return "REGRESSED";
  if (stats.retentionScore >= 85 && stats.masteryScore >= 85 && stats.confidenceScore >= 70) return "MASTERED";
  if (stats.retentionScore >= 70 && stats.masteryScore >= 75 && stats.confidenceScore >= 60) return "STABLE";
  if (previous.last_lesson_date && stats.masteryScore >= Number(previous.mastery_score || 0) + 10) return "IMPROVING";
  if (previous.last_lesson_date) return "REMEDIATING";
  const crossContext = stats.sessions >= config.confirmed_sessions || stats.formats >= config.confirmed_formats;
  if (stats.incorrect >= config.confirmed_errors && stats.distinctQuestions >= config.likely_questions
      && crossContext && stats.confidenceScore >= config.confirmed_confidence) return "CONFIRMED";
  if (stats.incorrect >= config.likely_errors && stats.distinctQuestions >= config.likely_questions) return "LIKELY";
  if (stats.incorrect >= config.suspected_errors) return "SUSPECTED";
  return "OBSERVED";
}

function calculatePriority(stats, state, config = DEFAULT_CONFIG.priority, now = new Date()) {
  const severity = { OBSERVED: 0.20, SUSPECTED: 0.35, LIKELY: 0.65, CONFIRMED: 1,
    REMEDIATING: 0.75, IMPROVING: 0.45, STABLE: 0.15, MASTERED: 0.05, REGRESSED: 1 }[state] || 0.2;
  const confidence = config.confidence_floor + (1 - config.confidence_floor) * clamp(stats.confidenceScore) / 100;
  const errors = config.error_floor + (1 - config.error_floor) * clamp(stats.errorRate) / 100;
  const recurrence = config.recurrence_floor + (1 - config.recurrence_floor) * ratio(stats.repeatedMisconceptions, 5);
  const recency = Math.max(0.2, 1 - daysSince(stats.lastIncorrectAttempt, now) / config.recency_decay_days);
  const prerequisite = stats.prerequisiteImportance || config.prerequisite_default;
  return Math.round(clamp(100 * severity * confidence * errors * recurrence * recency * prerequisite) * 100) / 100;
}

function mergeConfig(rows) {
  const byKey = new Map((rows || []).map((row) => [row.setting_key, row.setting_value]));
  return {
    mastery: { ...DEFAULT_CONFIG.mastery, ...(byKey.get("mastery_model_v1") || {}) },
    confidence: { ...DEFAULT_CONFIG.confidence, ...(byKey.get("confidence_model_v1") || {}) },
    evidence: { ...DEFAULT_CONFIG.evidence, ...(byKey.get("evidence_state_v1") || {}) },
    priority: { ...DEFAULT_CONFIG.priority, ...(byKey.get("priority_model_v1") || {}) },
  };
}

function createLearningAnalyticsService({
  pool,
  logger = console,
  now = () => new Date(),
  patternDetectionService,
  durableJobService,
}) {
  let timer = null;
  let busy = false;
  let configCache = null;
  let configLoadedAt = 0;
  let lastReconciledAt = 0;
  const patternService = patternDetectionService || createPatternDetectionService({ pool, logger });
  const jobs = durableJobService || createDurableJobService({
    pool,
    jobType: "skill_profile_rebuild",
    logger,
    retryDelayMs: () => 30000,
  });

  async function loadConfig() {
    if (configCache && Date.now() - configLoadedAt < 60000) return configCache;
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM system_learning_settings
       WHERE setting_key = ANY($1::text[])`,
      [["mastery_model_v1", "confidence_model_v1", "evidence_state_v1", "priority_model_v1"]]
    );
    configCache = mergeConfig(result.rows);
    configLoadedAt = Date.now();
    return configCache;
  }

  async function claimNext() {
    return jobs.claimNext();
  }

  async function reconcilePendingProfiles() {
    const result = await pool.query(
      `WITH latest AS (
         SELECT e.student_id, taxonomy.taxonomy_id, MAX(e.updated_at) AS event_updated_at
         FROM student_answer_events e
         CROSS JOIN LATERAL (VALUES (e.main_skill_id),(e.topic_id),(e.subskill_id),(e.micro_skill_id)) taxonomy(taxonomy_id)
         WHERE e.question_diagnostic_eligible=true AND taxonomy.taxonomy_id IS NOT NULL
         GROUP BY e.student_id, taxonomy.taxonomy_id
       )
       INSERT INTO ai_generation_jobs (job_type,entity_type,entity_id,payload,idempotency_key)
       SELECT 'skill_profile_rebuild','student_skill',l.student_id::text || ':' || l.taxonomy_id::text,
              jsonb_build_object('student_id',l.student_id,'taxonomy_id',l.taxonomy_id,'reason','reconciliation'),
              'skill-profile:v1:reconcile:' || l.student_id::text || ':' || l.taxonomy_id::text || ':'
                || EXTRACT(EPOCH FROM l.event_updated_at)::bigint::text
       FROM latest l
       LEFT JOIN student_skill_profiles p ON p.student_id=l.student_id AND p.taxonomy_id=l.taxonomy_id
       WHERE p.student_id IS NULL OR p.updated_at < l.event_updated_at
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`
    );
    lastReconciledAt = Date.now();
    return result.rows.length;
  }

  async function loadEvidence(studentId, taxonomyId) {
    return pool.query(
      `WITH relevant AS (
         SELECT e.*, COALESCE(a.analysis_confidence, 0.70)::float AS quality,
                ROW_NUMBER() OVER (ORDER BY e.answered_at DESC, e.id DESC) AS recent_rank
         FROM student_answer_events e
         LEFT JOIN question_ai_analysis a ON a.question_id=e.question_id
         WHERE e.student_id=$1 AND e.question_diagnostic_eligible=true
           AND $2::bigint = ANY(ARRAY[e.main_skill_id, e.topic_id, e.subskill_id, e.micro_skill_id]::bigint[])
       ), misconception AS (
         SELECT COALESCE(SUM(GREATEST(code_count - 1, 0)), 0)::int AS repeated_count
         FROM (SELECT COUNT(*)::int AS code_count FROM relevant
               WHERE is_correct=false AND selected_distractor_error_code IS NOT NULL
               GROUP BY selected_distractor_error_code) grouped
       )
       SELECT COUNT(*)::int AS exposures,
              COUNT(*) FILTER (WHERE is_correct)::int AS correct,
              COUNT(*) FILTER (WHERE NOT is_correct)::int AS incorrect,
              COUNT(*) FILTER (WHERE timed_out)::int AS timeouts,
              COUNT(DISTINCT source_mode || ':' || source_question_id)::int AS distinct_questions,
              COUNT(DISTINCT source_mode || ':' || source_record_id)::int AS sessions,
              COUNT(DISTINCT source_mode)::int AS formats,
              COALESCE(100 * SUM(CASE WHEN is_correct THEN quality ELSE 0 END) / NULLIF(SUM(quality),0),0)::float AS weighted_accuracy,
              AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL)::float AS average_response_time_ms,
              COUNT(*) FILTER (WHERE hint_used)::int AS hint_usage_count,
              COALESCE(AVG(quality),0)::float AS analysis_quality,
              MAX(answered_at) AS last_attempt,
              MAX(answered_at) FILTER (WHERE is_correct) AS last_correct_attempt,
              MAX(answered_at) FILTER (WHERE NOT is_correct) AS last_incorrect_attempt,
              COUNT(*) FILTER (WHERE recent_rank <= 5)::int AS recent_attempts,
              COUNT(*) FILTER (WHERE recent_rank <= 5 AND is_correct)::int AS recent_correct,
              (SELECT repeated_count FROM misconception) AS repeated_misconceptions,
              MAX(id) FILTER (WHERE recent_rank=1)::bigint AS latest_event_id
       FROM relevant`,
      [studentId, taxonomyId]
    );
  }

  function buildStats(row, previous, config) {
    const exposures = Number(row.exposures || 0);
    const recentAttempts = Number(row.recent_attempts || 0);
    const recentAccuracy = recentAttempts ? Number(row.recent_correct || 0) / recentAttempts * 100 : 100;
    const regressionFlag = ["MASTERED", "STABLE"].includes(previous.current_evidence_state)
      && recentAttempts >= config.evidence.regression_recent_attempts
      && recentAccuracy < config.evidence.regression_recent_accuracy;
    const stats = {
      exposures, correct: Number(row.correct || 0), incorrect: Number(row.incorrect || 0),
      timeouts: Number(row.timeouts || 0), distinctQuestions: Number(row.distinct_questions || 0),
      sessions: Number(row.sessions || 0), formats: Number(row.formats || 0),
      weightedAccuracy: Number(row.weighted_accuracy || 0), analysisQuality: Number(row.analysis_quality || 0),
      averageResponseTimeMs: row.average_response_time_ms == null ? null : Math.round(Number(row.average_response_time_ms)),
      expectedResponseTimeMs: Number(previous.expected_response_time_ms || config.mastery.expected_response_time_ms),
      hintUsageCount: Number(row.hint_usage_count || 0),
      hintUsageRate: exposures ? Number(row.hint_usage_count || 0) / exposures * 100 : 0,
      repeatedMisconceptions: Number(row.repeated_misconceptions || 0),
      retentionScore: Number(previous.retention_score || 0), regressionFlag,
      lastAttempt: row.last_attempt, lastIncorrectAttempt: row.last_incorrect_attempt,
      consistency: 1 - Math.min(1, Math.abs(Number(row.weighted_accuracy || 0) - recentAccuracy) / 100),
      prerequisiteImportance: Number(previous.prerequisite_importance || config.priority.prerequisite_default),
    };
    stats.confidenceScore = calculateConfidence(stats, config.confidence, now());
    stats.masteryScore = calculateMastery(stats, config.mastery);
    return stats;
  }

  async function rebuildProfile(studentId, taxonomyId) {
    const [config, taxonomy, previousResult, evidenceResult] = await Promise.all([
      loadConfig(),
      pool.query("SELECT id, node_type FROM learning_taxonomy WHERE id=$1 AND is_active=true", [taxonomyId]),
      pool.query("SELECT * FROM student_skill_profiles WHERE student_id=$1 AND taxonomy_id=$2", [studentId, taxonomyId]),
      loadEvidence(studentId, taxonomyId),
    ]);
    if (!taxonomy.rows.length || !evidenceResult.rows.length || !Number(evidenceResult.rows[0].exposures)) return null;
    const previous = previousResult.rows[0] || {};
    const row = evidenceResult.rows[0];
    const stats = buildStats(row, previous, config);
    const patterns = await patternService.rebuildSkillPatterns(studentId, taxonomyId, {
      taxonomyLevel: taxonomy.rows[0].node_type,
      expectedResponseTimeMs: stats.expectedResponseTimeMs,
      regressionFlag: stats.regressionFlag,
    });
    stats.repeatedMisconceptions = Math.max(stats.repeatedMisconceptions, patterns.repeatedMisconceptions);
    stats.regressionFlag = stats.regressionFlag || patterns.regressionFlag;
    stats.masteryScore = calculateMastery(stats, config.mastery);
    const state = determineEvidenceState(stats, previous, config.evidence);
    const priority = calculatePriority(stats, state, config.priority, now());
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query(
        `INSERT INTO student_skill_profiles (
           student_id,taxonomy_id,taxonomy_level,exposure_count,correct_count,incorrect_count,timeout_count,
           distinct_question_count,session_count,format_count,weighted_accuracy,error_rate,average_response_time_ms,
           expected_response_time_ms,hint_usage_count,hint_usage_rate,repeated_misconception_count,analysis_quality,
           mastery_score,confidence_score,confidence_label,retention_score,current_evidence_state,last_attempt,
           last_correct_attempt,last_incorrect_attempt,last_lesson_date,next_review_date,regression_flag,
           prerequisite_gap_flag,current_priority,profile_version,dominant_error_classification,
           active_finding_count,pattern_summary
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
         ON CONFLICT (student_id,taxonomy_id) DO UPDATE SET
           taxonomy_level=EXCLUDED.taxonomy_level, exposure_count=EXCLUDED.exposure_count,
           correct_count=EXCLUDED.correct_count, incorrect_count=EXCLUDED.incorrect_count,
           timeout_count=EXCLUDED.timeout_count, distinct_question_count=EXCLUDED.distinct_question_count,
           session_count=EXCLUDED.session_count, format_count=EXCLUDED.format_count,
           weighted_accuracy=EXCLUDED.weighted_accuracy, error_rate=EXCLUDED.error_rate,
           average_response_time_ms=EXCLUDED.average_response_time_ms,
           expected_response_time_ms=EXCLUDED.expected_response_time_ms,
           hint_usage_count=EXCLUDED.hint_usage_count, hint_usage_rate=EXCLUDED.hint_usage_rate,
           repeated_misconception_count=EXCLUDED.repeated_misconception_count,
           analysis_quality=EXCLUDED.analysis_quality, mastery_score=EXCLUDED.mastery_score,
           confidence_score=EXCLUDED.confidence_score, confidence_label=EXCLUDED.confidence_label,
           current_evidence_state=EXCLUDED.current_evidence_state, last_attempt=EXCLUDED.last_attempt,
           last_correct_attempt=EXCLUDED.last_correct_attempt, last_incorrect_attempt=EXCLUDED.last_incorrect_attempt,
           regression_flag=EXCLUDED.regression_flag, current_priority=EXCLUDED.current_priority,
           profile_version=EXCLUDED.profile_version,
           dominant_error_classification=EXCLUDED.dominant_error_classification,
           active_finding_count=EXCLUDED.active_finding_count,
           pattern_summary=EXCLUDED.pattern_summary,prerequisite_gap_flag=EXCLUDED.prerequisite_gap_flag,
           updated_at=NOW()
         RETURNING *`,
        [studentId,taxonomyId,taxonomy.rows[0].node_type,stats.exposures,stats.correct,stats.incorrect,stats.timeouts,
          stats.distinctQuestions,stats.sessions,stats.formats,stats.weightedAccuracy,
          stats.exposures ? stats.incorrect / stats.exposures * 100 : 0,stats.averageResponseTimeMs,
          stats.expectedResponseTimeMs,stats.hintUsageCount,stats.hintUsageRate,stats.repeatedMisconceptions,
          stats.analysisQuality,stats.masteryScore,stats.confidenceScore,confidenceLabel(stats.confidenceScore),
          stats.retentionScore,state,row.last_attempt,row.last_correct_attempt,row.last_incorrect_attempt,
          previous.last_lesson_date || null,previous.next_review_date || null,stats.regressionFlag,
          patterns.prerequisiteGap,priority,PROFILE_VERSION,patterns.dominantClassification,
          patterns.activeFindingCount,JSON.stringify(patterns.summary)]
      );
      const profile = saved.rows[0];
      const changed = !previous.student_id || Math.abs(Number(previous.mastery_score || 0) - stats.masteryScore) >= 1
        || previous.current_evidence_state !== state;
      if (changed) {
        await client.query(
          `INSERT INTO mastery_history (student_id,taxonomy_id,trigger_answer_event_id,previous_mastery_score,
             mastery_score,confidence_score,previous_evidence_state,evidence_state,evidence_snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [studentId,taxonomyId,row.latest_event_id,previous.mastery_score || null,stats.masteryScore,
            stats.confidenceScore,previous.current_evidence_state || null,state,
            JSON.stringify({ exposures: stats.exposures, weighted_accuracy: stats.weightedAccuracy,
              distinct_questions: stats.distinctQuestions, sessions: stats.sessions, formats: stats.formats })]
        );
      }
      const reportMateriallyChanged = !previous.student_id
        || Math.abs(Number(previous.mastery_score || 0) - stats.masteryScore) >= 5
        || previous.current_evidence_state !== state;
      if (reportMateriallyChanged) {
        await client.query(
          `UPDATE ai_reports SET is_stale=true,stale_at=NOW()
           WHERE target_student_id=$1 AND is_stale=false`,
          [studentId]
        );
      }
      if (row.latest_event_id) {
        await client.query(
          `UPDATE student_answer_events SET skill_state_after=COALESCE(skill_state_after,'{}'::jsonb)
             || jsonb_build_object($2::text,$3::jsonb) WHERE id=$1`,
          [row.latest_event_id,taxonomyId,JSON.stringify({ mastery: stats.masteryScore,
            confidence: stats.confidenceScore, state, priority, version: PROFILE_VERSION })]
        );
      }
      await client.query("COMMIT");
      return profile;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function processNext() {
    const job = await claimNext();
    if (!job) return false;
    await jobs.execute(job, async () => {
      const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
      return rebuildProfile(Number(payload.student_id), Number(payload.taxonomy_id));
    }, { metadata: { entity_id: job.entity_id } });
    return true;
  }

  async function processBatchSafe(limit = 10) {
    if (busy) return 0;
    busy = true;
    let processed = 0;
    try {
      if (Date.now() - lastReconciledAt >= 300000) await reconcilePendingProfiles();
      while (processed < limit && await processNext()) processed++;
    } catch (error) {
      logger.error("Skill profile worker xatosi:", error.message);
    } finally {
      busy = false;
    }
    return processed;
  }

  function startWorker(intervalMs = 5000) {
    if (timer) return timer;
    setImmediate(() => processBatchSafe(25));
    timer = setInterval(() => processBatchSafe(10), intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    return timer;
  }

  function stopWorker() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    loadConfig, reconcilePendingProfiles, rebuildProfile, processNext,
    processBatchSafe, startWorker, stopWorker,
  };
}

async function scheduleSkillProfileUpdates(pool, savedEvents, logger = console) {
  const pairs = new Map();
  for (const event of savedEvents || []) {
    if (!event || !event.question_diagnostic_eligible) continue;
    for (const taxonomyId of [event.main_skill_id,event.topic_id,event.subskill_id,event.micro_skill_id]) {
      if (!taxonomyId) continue;
      const key = `${event.student_id}:${taxonomyId}`;
      if (!pairs.has(key) || Number(pairs.get(key).event_id) < Number(event.id)) {
        pairs.set(key, { student_id: event.student_id, taxonomy_id: taxonomyId,
          event_id: event.id, event_updated_at: event.updated_at || event.answered_at || new Date() });
      }
    }
  }
  if (!pairs.size) return 0;
  try {
    const entries = Array.from(pairs.values());
    const before = await pool.query(
      `WITH requested AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(student_id int,taxonomy_id bigint,event_id bigint)
       )
       SELECT r.event_id,r.taxonomy_id,p.mastery_score,p.confidence_score,
              p.current_evidence_state,p.current_priority,p.profile_version
       FROM requested r JOIN student_skill_profiles p
         ON p.student_id=r.student_id AND p.taxonomy_id=r.taxonomy_id`,
      [JSON.stringify(entries)]
    );
    const annotations = new Map();
    for (const row of before.rows) {
      const current = annotations.get(String(row.event_id)) || {};
      current[String(row.taxonomy_id)] = {
        mastery_score: row.mastery_score,
        confidence_score: row.confidence_score,
        current_evidence_state: row.current_evidence_state,
        current_priority: row.current_priority,
        profile_version: row.profile_version,
      };
      annotations.set(String(row.event_id), current);
    }
    if (annotations.size) {
      await pool.query(
        `WITH snapshots AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(event_id bigint,snapshot jsonb)
         )
         UPDATE student_answer_events e SET skill_state_before=COALESCE(e.skill_state_before,'{}'::jsonb) || s.snapshot
         FROM snapshots s WHERE e.id=s.event_id`,
        [JSON.stringify(Array.from(annotations, ([event_id, snapshot]) => ({ event_id, snapshot })))]
      );
    }
    const jobs = entries.map((pair) => {
      const version = new Date(pair.event_updated_at).getTime();
      return {
        entity_id: `${pair.student_id}:${pair.taxonomy_id}`,
        payload: { student_id: pair.student_id, taxonomy_id: pair.taxonomy_id, reason: "answer_recorded" },
        idempotency_key: `skill-profile:v1:${pair.student_id}:${pair.taxonomy_id}:${pair.event_id}:${version}`,
      };
    });
    await pool.query(
      `WITH jobs AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb)
           AS x(entity_id text,payload jsonb,idempotency_key text)
       )
       INSERT INTO ai_generation_jobs (job_type,entity_type,entity_id,payload,idempotency_key)
       SELECT 'skill_profile_rebuild','student_skill',entity_id,payload,idempotency_key FROM jobs
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [JSON.stringify(jobs)]
    );
    return pairs.size;
  } catch (error) {
    logger.error("Skill profile navbatiga qo'shish xato:", error.message);
    return 0;
  }
}

module.exports = {
  PROFILE_VERSION, DEFAULT_CONFIG, calculateMastery, calculateConfidence,
  calculatePriority, determineEvidenceState, confidenceLabel, mergeConfig,
  createLearningAnalyticsService, scheduleSkillProfileUpdates,
};
