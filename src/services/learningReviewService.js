const {
  DEFAULT_CONFIG: ANALYTICS_DEFAULTS,
  calculateMastery,
  calculateConfidence,
  confidenceLabel,
  mergeConfig,
} = require("./learningAnalyticsService");
const { isApprovedExercise } = require("./personalizedLessonService");

const RETEST_SCHEMA_VERSION = "targeted_retest_v1";
const REVIEW_SCHEMA_VERSION = "spaced_review_v1";
const VALID_OPTIONS = new Set(["A", "B", "C", "D"]);
const DEFAULT_REVIEW_CONFIG = Object.freeze({
  question_count: 10,
  required_correct: 8,
  required_successful_retests: 2,
  review_days: [0, 1, 3, 7, 21],
  minimum_formats: 2,
  retention_weight: 0.4,
  failed_review_threshold: 2,
  mastery_threshold: 85,
  confidence_threshold: 70,
  retention_threshold: 85,
});

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function assessmentQuality(exercises, config = DEFAULT_REVIEW_CONFIG) {
  const warnings = [];
  if (exercises.length !== Number(config.question_count)) warnings.push("INSUFFICIENT_NEW_QUESTIONS");
  const formats = new Set(exercises.map((item) => item.question_format));
  if (formats.size < Number(config.minimum_formats)) warnings.push("INSUFFICIENT_FORMAT_DIVERSITY");
  return { approved: warnings.length === 0, warnings, formatCount: formats.size };
}

function makeAssessmentExercises(questions, count) {
  return questions.slice(0,count).map((question,index) => ({
    source_question_id: Number(question.id),
    position: index + 1,
    question_format: String(question.question_type || "multiple_choice").trim().slice(0,80),
    prompt: String(question.question_text || "").trim(),
    options: {
      A: String(question.option_a || "").trim(), B: String(question.option_b || "").trim(),
      C: String(question.option_c || "").trim(), D: String(question.option_d || "").trim(),
    },
    correct_option: String(question.correct_option || "").trim().toUpperCase(),
    explanation: String(question.explanation || "").trim(),
  }));
}

function determineAssessmentOutcome({
  assessmentType,
  passed,
  sequenceNo,
  successfulRetests,
  failedReviews,
  priorPlanStatus,
  masteryScore = 0,
  confidenceScore = 0,
  retentionScore = 0,
  config = DEFAULT_REVIEW_CONFIG,
}) {
  if (assessmentType === "RETEST") {
    if (!passed) return { planStatus: "RETEST_FAILED", evidenceState: "REMEDIATING", next: "LESSON_REVIEW" };
    if (successfulRetests < Number(config.required_successful_retests)) {
      return { planStatus: "RETEST_PENDING", evidenceState: "IMPROVING", next: "RETEST" };
    }
    return { planStatus: "REVIEW_PENDING", evidenceState: "STABLE", next: "REVIEWS" };
  }
  if (["MASTERED", "STABLE"].includes(priorPlanStatus) && !passed) {
    return { planStatus: "REGRESSED", evidenceState: "REGRESSED", next: "LESSON_REVIEW" };
  }
  if (failedReviews >= Number(config.failed_review_threshold)) {
    return { planStatus: "RETEST_FAILED", evidenceState: "REMEDIATING", next: "LESSON_REVIEW" };
  }
  const finalReview = sequenceNo >= config.review_days.length;
  if (finalReview && passed && masteryScore >= Number(config.mastery_threshold)
      && confidenceScore >= Number(config.confidence_threshold)
      && retentionScore >= Number(config.retention_threshold)) {
    return { planStatus: "MASTERED", evidenceState: "MASTERED", next: "DONE" };
  }
  if (finalReview && passed) return { planStatus: "STABLE", evidenceState: "STABLE", next: "EXTENDED_REVIEW" };
  if (finalReview) return { planStatus: "REGRESSED", evidenceState: "REGRESSED", next: "LESSON_REVIEW" };
  return { planStatus: "REVIEW_PENDING", evidenceState: passed ? "STABLE" : "IMPROVING", next: "REVIEW" };
}

function reviewAdjustment({ passed, accuracy, averageResponseTimeMs, expectedResponseTimeMs }) {
  if (!passed) return "SHORTEN";
  if (Number(accuracy) >= 90 && Number(averageResponseTimeMs) > 0
      && Number(averageResponseTimeMs) <= Number(expectedResponseTimeMs || 20000)) return "EXPAND";
  return "MAINTAIN";
}

function calculateAssessmentProfile(profile, assessment, config, analyticsConfig, now = new Date()) {
  const previousExposures = Number(profile.exposure_count || 0);
  const total = Number(assessment.total || config.question_count);
  const correct = Number(assessment.correct || 0);
  const exposures = previousExposures + total;
  const weightedAccuracy = exposures
    ? (Number(profile.weighted_accuracy || 0) * previousExposures + correct * 100) / exposures : 0;
  const priorRetention = Number(profile.retention_score || 0);
  const retentionScore = assessment.type === "REVIEW"
    ? (priorRetention ? priorRetention * (1 - config.retention_weight) : Number(assessment.accuracy))
      + Number(assessment.accuracy) * (priorRetention ? config.retention_weight : 0)
    : priorRetention;
  const regressionFlag = assessment.type === "REVIEW"
    && ["STABLE", "MASTERED"].includes(profile.current_evidence_state)
    && Number(assessment.accuracy) < 50;
  const stats = {
    exposures,
    distinctQuestions: Number(profile.distinct_question_count || 0) + total,
    sessions: Number(profile.session_count || 0) + 1,
    formats: Math.max(Number(profile.format_count || 0), Number(assessment.formatCount || 1)),
    weightedAccuracy,
    analysisQuality: Math.max(Number(profile.analysis_quality || 0), 0.85),
    retentionScore,
    averageResponseTimeMs: assessment.averageResponseTimeMs,
    expectedResponseTimeMs: Number(profile.expected_response_time_ms || analyticsConfig.mastery.expected_response_time_ms),
    hintUsageRate: Number(profile.hint_usage_rate || 0),
    repeatedMisconceptions: Number(profile.repeated_misconception_count || 0) + (assessment.passed ? 0 : 1),
    regressionFlag,
    lastAttempt: now,
    consistency: Math.max(0, 1 - Math.abs(weightedAccuracy - Number(assessment.accuracy)) / 100),
  };
  return {
    masteryScore: calculateMastery(stats, analyticsConfig.mastery),
    confidenceScore: calculateConfidence(stats, analyticsConfig.confidence, now),
    retentionScore: Math.round(clamp(retentionScore) * 100) / 100,
    weightedAccuracy: Math.round(clamp(weightedAccuracy) * 100) / 100,
    regressionFlag,
  };
}

function createLearningReviewService({ pool, createNotification, logger = console, now = () => new Date() }) {
  let timer = null;
  let configCache = null;
  let configLoadedAt = 0;

  async function loadConfig() {
    if (configCache && Date.now() - configLoadedAt < 60000) return configCache;
    const result = await pool.query(
      `SELECT setting_key,setting_value FROM system_learning_settings
       WHERE setting_key=ANY($1::text[])`,
      [["retest_review_v1", "mastery_model_v1", "confidence_model_v1", "evidence_state_v1", "priority_model_v1"]]
    );
    const analytics = mergeConfig(result.rows);
    const row = result.rows.find((item) => item.setting_key === "retest_review_v1");
    configCache = { ...analytics, review: { ...DEFAULT_REVIEW_CONFIG, ...(row && row.setting_value || {}) } };
    configLoadedAt = Date.now();
    return configCache;
  }

  async function loadPlan(studentId, planId) {
    const result = await pool.query(
      `SELECT rp.*,u.cefr_level,p.*
       FROM remediation_plans rp JOIN users u ON u.id=rp.student_id
       JOIN student_skill_profiles p ON p.student_id=rp.student_id AND p.taxonomy_id=rp.taxonomy_id
       WHERE rp.id=$1 AND rp.student_id=$2`, [planId,studentId]
    );
    return result.rows[0] || null;
  }

  async function loadApprovedQuestions(plan, count) {
    const originals = await pool.query(
      `SELECT DISTINCT LOWER(TRIM(q.question_text)) AS question_text
       FROM student_answer_events e JOIN questions q ON q.id=e.question_id
       WHERE e.student_id=$1 AND e.is_correct=false AND e.question_diagnostic_eligible=true
         AND $2::bigint=ANY(ARRAY[e.main_skill_id,e.topic_id,e.subskill_id,e.micro_skill_id]::bigint[])`,
      [plan.student_id,plan.taxonomy_id]
    );
    const result = await pool.query(
      `WITH RECURSIVE lineage AS (
         SELECT id,parent_id,0 AS depth FROM learning_taxonomy WHERE id=$1
         UNION ALL SELECT t.id,t.parent_id,l.depth+1 FROM learning_taxonomy t JOIN lineage l ON l.parent_id=t.id
       ), used AS (
         SELECT e.source_question_id AS id FROM personalized_lesson_exercises e
         JOIN personalized_lessons l ON l.id=e.lesson_id WHERE l.remediation_plan_id=$2
       )
       SELECT DISTINCT ON (q.id) q.*,qa.question_type,l.depth
       FROM lineage l JOIN question_taxonomy_tags qt ON qt.taxonomy_id=l.id
       JOIN questions q ON q.id=qt.question_id JOIN question_ai_analysis qa ON qa.question_id=q.id
       WHERE q.diagnostic_eligible=true AND qa.diagnostic_eligible=true
         AND (q.status IS NULL OR q.status IN ('active','published'))
         AND NOT EXISTS (SELECT 1 FROM used WHERE used.id=q.id)
       ORDER BY q.id,l.depth ASC LIMIT $3`,
      [plan.taxonomy_id,plan.id,Math.max(count * 5, 50)]
    );
    const originalTexts = new Set(originals.rows.map((row) => row.question_text).filter(Boolean));
    return makeAssessmentExercises(result.rows.filter((question) => (
      isApprovedExercise(question,originalTexts,plan.cefr_level)
    )),count);
  }

  async function saveAssessment(plan, type, sequenceNo, scheduledFor, exercises, quality, config) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const schema = type === "REVIEW" ? REVIEW_SCHEMA_VERSION : RETEST_SCHEMA_VERSION;
      const saved = await client.query(
        `INSERT INTO targeted_retests
           (remediation_plan_id,student_id,taxonomy_id,assessment_type,sequence_no,schema_version,status,
            quality_status,quality_warnings,scheduled_for,question_count,required_correct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
         ON CONFLICT (remediation_plan_id,assessment_type,sequence_no) DO UPDATE SET
           status=CASE WHEN targeted_retests.status='REVIEW_REQUIRED' THEN EXCLUDED.status ELSE targeted_retests.status END,
           quality_status=CASE WHEN targeted_retests.status='REVIEW_REQUIRED' THEN EXCLUDED.quality_status ELSE targeted_retests.quality_status END,
           quality_warnings=CASE WHEN targeted_retests.status='REVIEW_REQUIRED' THEN EXCLUDED.quality_warnings ELSE targeted_retests.quality_warnings END,
           updated_at=NOW() RETURNING *`,
        [plan.id,plan.student_id,plan.taxonomy_id,type,sequenceNo,schema,
          quality.approved ? "READY" : "REVIEW_REQUIRED",quality.approved ? "APPROVED" : "REVIEW_REQUIRED",
          JSON.stringify(quality.warnings),scheduledFor,config.question_count,config.required_correct]
      );
      const assessment = saved.rows[0];
      if (quality.approved) {
        for (const exercise of exercises) {
          await client.query(
            `INSERT INTO targeted_retest_questions
               (targeted_retest_id,source_question_id,position,question_format,prompt,options,correct_option,explanation)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT DO NOTHING`,
            [assessment.id,exercise.source_question_id,exercise.position,exercise.question_format,
              exercise.prompt,JSON.stringify(exercise.options),exercise.correct_option,exercise.explanation]
          );
        }
      } else {
        await client.query(
          `UPDATE remediation_plans SET status='TEACHER_REVIEW_REQUIRED',updated_at=NOW() WHERE id=$1`, [plan.id]
        );
      }
      if (type === "REVIEW") {
        await client.query(
          `UPDATE review_schedules SET targeted_retest_id=$2,status=CASE WHEN $3 THEN 'DUE' ELSE status END,
             updated_at=NOW() WHERE remediation_plan_id=$1 AND sequence_no=$4`,
          [plan.id,assessment.id,quality.approved,sequenceNo]
        );
      }
      await client.query("COMMIT");
      return assessment;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function ensureAssessment(studentId, planId, type, sequenceNo, scheduledFor = now()) {
    const plan = await loadPlan(studentId,planId);
    if (!plan) return null;
    const existing = await pool.query(
      `SELECT * FROM targeted_retests WHERE remediation_plan_id=$1 AND assessment_type=$2 AND sequence_no=$3`,
      [planId,type,sequenceNo]
    );
    if (existing.rows[0] && existing.rows[0].status !== "REVIEW_REQUIRED") return existing.rows[0];
    const config = (await loadConfig()).review;
    const exercises = await loadApprovedQuestions(plan,Number(config.question_count));
    const quality = assessmentQuality(exercises,config);
    return saveAssessment(plan,type,sequenceNo,scheduledFor,exercises,quality,config);
  }

  async function ensureInitialRetest(studentId, planId) {
    return ensureAssessment(studentId,planId,"RETEST",1,now());
  }

  async function createReviewSchedules(client, assessment, config) {
    for (let index = 0; index < config.review_days.length; index++) {
      const delay = Number(config.review_days[index]);
      await client.query(
        `INSERT INTO review_schedules
           (remediation_plan_id,student_id,taxonomy_id,sequence_no,interval_days,scheduled_for)
         VALUES ($1,$2,$3,$4,$5::int,$6::timestamp + ($5::int::text || ' days')::interval)
         ON CONFLICT (remediation_plan_id,sequence_no) DO NOTHING`,
        [assessment.remediation_plan_id,assessment.student_id,assessment.taxonomy_id,index + 1,delay,now()]
      );
    }
  }

  async function createExtendedReviewSchedule(client, assessment) {
    const sequenceNo = Number(assessment.sequence_no) + 1;
    await client.query(
      `INSERT INTO review_schedules
         (remediation_plan_id,student_id,taxonomy_id,sequence_no,interval_days,scheduled_for)
       VALUES ($1,$2,$3,$4,21,$5::timestamp + INTERVAL '21 days')
       ON CONFLICT (remediation_plan_id,sequence_no) DO NOTHING`,
      [assessment.remediation_plan_id,assessment.student_id,assessment.taxonomy_id,sequenceNo,now()]
    );
  }

  async function listDue(studentId) {
    await syncStudentAssessments(studentId);
    const result = await pool.query(
      `SELECT r.id,r.remediation_plan_id,r.assessment_type,r.sequence_no,r.status,r.scheduled_for,
              r.question_count,r.required_correct,t.name AS target_skill_name,
              COALESCE(a.correct_count,0)::int AS correct_count,
              (SELECT COUNT(*)::int FROM retest_attempt_answers aa
               WHERE aa.retest_attempt_id=a.id) AS answered_count
       FROM targeted_retests r JOIN learning_taxonomy t ON t.id=r.taxonomy_id
       LEFT JOIN retest_attempts a ON a.targeted_retest_id=r.id
       WHERE r.student_id=$1 AND r.status IN ('READY','STARTED') AND r.scheduled_for<=NOW()
       ORDER BY r.scheduled_for,r.id`, [studentId]
    );
    return result.rows;
  }

  async function getAssessment(studentId, assessmentId) {
    const result = await pool.query(
      `SELECT r.*,t.name AS target_skill_name,a.id AS attempt_id,a.correct_count,a.total_count,a.accuracy,a.passed
       FROM targeted_retests r JOIN learning_taxonomy t ON t.id=r.taxonomy_id
       LEFT JOIN retest_attempts a ON a.targeted_retest_id=r.id
       WHERE r.id=$1 AND r.student_id=$2 AND r.quality_status='APPROVED'`, [assessmentId,studentId]
    );
    if (!result.rows[0]) return null;
    const questions = await pool.query(
      `SELECT q.id,q.position,q.question_format,q.prompt,q.options,aa.selected_option,aa.answered_at,
              CASE WHEN r.status='COMPLETED' THEN q.correct_option END AS correct_option,
              CASE WHEN r.status='COMPLETED' THEN q.explanation END AS explanation,
              CASE WHEN r.status='COMPLETED' THEN aa.is_correct END AS is_correct
       FROM targeted_retest_questions q JOIN targeted_retests r ON r.id=q.targeted_retest_id
       LEFT JOIN retest_attempts a ON a.targeted_retest_id=r.id
       LEFT JOIN retest_attempt_answers aa ON aa.retest_attempt_id=a.id AND aa.assessment_question_id=q.id
       WHERE q.targeted_retest_id=$1 ORDER BY q.position`, [assessmentId]
    );
    return { ...result.rows[0], questions: questions.rows };
  }

  async function startAssessment(studentId, assessmentId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE targeted_retests SET status='STARTED',updated_at=NOW()
         WHERE id=$1 AND student_id=$2 AND status IN ('READY','STARTED') AND scheduled_for<=NOW()
         RETURNING *`, [assessmentId,studentId]
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      await client.query(
        `INSERT INTO retest_attempts (targeted_retest_id,student_id) VALUES ($1,$2)
         ON CONFLICT (targeted_retest_id) DO NOTHING`, [assessmentId,studentId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return getAssessment(studentId,assessmentId);
  }

  async function answerQuestion(studentId, assessmentId, questionId, selectedOption, responseTimeMs) {
    const selected = String(selectedOption || "").trim().toUpperCase();
    if (!VALID_OPTIONS.has(selected)) return { validation_error: true };
    const result = await pool.query(
      `SELECT q.correct_option,a.id AS attempt_id
       FROM targeted_retest_questions q JOIN targeted_retests r ON r.id=q.targeted_retest_id
       JOIN retest_attempts a ON a.targeted_retest_id=r.id
       WHERE q.id=$1 AND r.id=$2 AND r.student_id=$3 AND r.status='STARTED'`,
      [questionId,assessmentId,studentId]
    );
    if (!result.rows[0]) return null;
    const isCorrect = result.rows[0].correct_option === selected;
    await pool.query(
      `INSERT INTO retest_attempt_answers
         (retest_attempt_id,assessment_question_id,student_id,selected_option,is_correct,response_time_ms)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (retest_attempt_id,assessment_question_id) DO UPDATE SET
         selected_option=EXCLUDED.selected_option,is_correct=EXCLUDED.is_correct,
         response_time_ms=EXCLUDED.response_time_ms,answered_at=NOW()`,
      [result.rows[0].attempt_id,questionId,studentId,selected,isCorrect,
        Number.isInteger(Number(responseTimeMs)) && Number(responseTimeMs) >= 0 ? Number(responseTimeMs) : null]
    );
    const progress = await pool.query(
      `SELECT COUNT(aa.id)::int AS answered,COUNT(q.id)::int AS total
       FROM targeted_retest_questions q LEFT JOIN retest_attempt_answers aa
         ON aa.assessment_question_id=q.id AND aa.retest_attempt_id=$2
       WHERE q.targeted_retest_id=$1`, [assessmentId,result.rows[0].attempt_id]
    );
    return { accepted: true, answered_count: progress.rows[0].answered, total_count: progress.rows[0].total };
  }

  async function completeAssessment(studentId, assessmentId) {
    const config = await loadConfig();
    const client = await pool.connect();
    let nextAction = null;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT r.*,a.id AS attempt_id,rp.status AS prior_plan_status
         FROM targeted_retests r JOIN remediation_plans rp ON rp.id=r.remediation_plan_id
         JOIN retest_attempts a ON a.targeted_retest_id=r.id
         WHERE r.id=$1 AND r.student_id=$2 AND r.status='STARTED'
         FOR UPDATE OF r,a,rp`, [assessmentId,studentId]
      );
      const assessment = result.rows[0];
      if (!assessment) { await client.query("ROLLBACK"); return null; }
      const statsResult = await client.query(
        `SELECT COUNT(q.id)::int AS total,COUNT(aa.id)::int AS answered,
                COUNT(aa.id) FILTER (WHERE aa.is_correct)::int AS correct,
                AVG(aa.response_time_ms)::float AS average_response_time_ms,
                COUNT(DISTINCT q.question_format)::int AS format_count
         FROM targeted_retest_questions q LEFT JOIN retest_attempt_answers aa
           ON aa.retest_attempt_id=$2 AND aa.assessment_question_id=q.id
         WHERE q.targeted_retest_id=$1`, [assessmentId,assessment.attempt_id]
      );
      Object.assign(assessment,statsResult.rows[0]);
      if (Number(assessment.answered) < Number(assessment.total)) {
        await client.query("ROLLBACK");
        return { incomplete: true, answered: Number(assessment.answered), total: Number(assessment.total) };
      }
      const accuracy = Number(assessment.total) ? Number(assessment.correct) / Number(assessment.total) * 100 : 0;
      const passed = Number(assessment.correct) >= Number(assessment.required_correct);
      await client.query(
        `UPDATE retest_attempts SET completed_at=NOW(),correct_count=$2,total_count=$3,accuracy=$4,passed=$5 WHERE id=$1`,
        [assessment.attempt_id,assessment.correct,assessment.total,accuracy,passed]
      );
      await client.query("UPDATE targeted_retests SET status='COMPLETED',updated_at=NOW() WHERE id=$1", [assessmentId]);
      const counters = await client.query(
        `SELECT COUNT(*) FILTER (WHERE r.assessment_type='RETEST' AND a.passed)::int AS successful_retests,
                COUNT(*) FILTER (WHERE r.assessment_type='REVIEW' AND NOT a.passed)::int AS failed_reviews
         FROM targeted_retests r JOIN retest_attempts a ON a.targeted_retest_id=r.id
         WHERE r.remediation_plan_id=$1 AND a.completed_at IS NOT NULL`, [assessment.remediation_plan_id]
      );
      const profileResult = await client.query(
        `SELECT * FROM student_skill_profiles WHERE student_id=$1 AND taxonomy_id=$2 FOR UPDATE`,
        [studentId,assessment.taxonomy_id]
      );
      const profile = profileResult.rows[0];
      const scores = calculateAssessmentProfile(profile,{ type: assessment.assessment_type,
        total: assessment.total,correct: assessment.correct,accuracy,passed,
        formatCount: assessment.format_count,averageResponseTimeMs: assessment.average_response_time_ms },
      config.review,config,now());
      const outcome = determineAssessmentOutcome({ assessmentType: assessment.assessment_type,passed,
        sequenceNo: Number(assessment.sequence_no),successfulRetests: counters.rows[0].successful_retests,
        failedReviews: counters.rows[0].failed_reviews,priorPlanStatus: assessment.prior_plan_status,
        masteryScore: scores.masteryScore,confidenceScore: scores.confidenceScore,
        retentionScore: scores.retentionScore,config: config.review });
      await client.query(
        `UPDATE student_skill_profiles SET mastery_score=$3,confidence_score=$4,confidence_label=$5,
           retention_score=$6,current_evidence_state=$7,regression_flag=$8,weighted_accuracy=$9,
           next_review_date=(SELECT MIN(scheduled_for) FROM review_schedules
             WHERE remediation_plan_id=$10 AND status IN ('PENDING','DUE')),updated_at=NOW()
         WHERE student_id=$1 AND taxonomy_id=$2`,
        [studentId,assessment.taxonomy_id,scores.masteryScore,scores.confidenceScore,
          confidenceLabel(scores.confidenceScore),scores.retentionScore,outcome.evidenceState,
          scores.regressionFlag || outcome.evidenceState === "REGRESSED",scores.weightedAccuracy,
          assessment.remediation_plan_id]
      );
      await client.query(
        `INSERT INTO mastery_history
           (student_id,taxonomy_id,previous_mastery_score,mastery_score,confidence_score,
            previous_evidence_state,evidence_state,calculation_version,evidence_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'retest_review_v1',$8::jsonb)`,
        [studentId,assessment.taxonomy_id,profile.mastery_score,scores.masteryScore,scores.confidenceScore,
          profile.current_evidence_state,outcome.evidenceState,JSON.stringify({ assessment_id: assessmentId,
            type: assessment.assessment_type,correct: Number(assessment.correct),total: Number(assessment.total),
            accuracy,passed,retention_score: scores.retentionScore })]
      );
      await client.query(
        `UPDATE remediation_plans SET status=$2,updated_at=NOW() WHERE id=$1`,
        [assessment.remediation_plan_id,outcome.planStatus]
      );
      await client.query(
        `INSERT INTO remediation_history
           (remediation_plan_id,student_id,from_status,to_status,event_type,event_payload)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [assessment.remediation_plan_id,studentId,assessment.prior_plan_status,outcome.planStatus,
          assessment.assessment_type === "RETEST" ? "RETEST_COMPLETED" : "REVIEW_COMPLETED",
          JSON.stringify({ assessment_id: assessmentId,accuracy,passed,outcome: outcome.next })]
      );
      if (assessment.assessment_type === "REVIEW") {
        await client.query(
          `UPDATE review_schedules SET status='COMPLETED',completed_at=NOW(),updated_at=NOW()
           WHERE targeted_retest_id=$1`, [assessmentId]
        );
        const adjustment = reviewAdjustment({ passed,accuracy,
          averageResponseTimeMs: assessment.average_response_time_ms,
          expectedResponseTimeMs: profile.expected_response_time_ms });
        if (adjustment === "SHORTEN") {
          await client.query(
            `UPDATE review_schedules SET scheduled_for=LEAST(scheduled_for,$2::timestamp + INTERVAL '1 day'),updated_at=NOW()
             WHERE id=(SELECT id FROM review_schedules WHERE remediation_plan_id=$1 AND status='PENDING'
               ORDER BY sequence_no LIMIT 1)`, [assessment.remediation_plan_id,now()]
          );
        } else if (adjustment === "EXPAND") {
          await client.query(
            `UPDATE review_schedules SET scheduled_for=GREATEST(scheduled_for,
               $2::timestamp + make_interval(days=>GREATEST(interval_days+1,CEIL(interval_days*1.25)::int))),updated_at=NOW()
             WHERE id=(SELECT id FROM review_schedules WHERE remediation_plan_id=$1 AND status='PENDING'
               ORDER BY sequence_no LIMIT 1)`, [assessment.remediation_plan_id,now()]
          );
        }
        await client.query(
          `UPDATE student_skill_profiles SET next_review_date=(SELECT MIN(scheduled_for)
             FROM review_schedules WHERE remediation_plan_id=$3 AND status IN ('PENDING','DUE'))
           WHERE student_id=$1 AND taxonomy_id=$2`,
          [studentId,assessment.taxonomy_id,assessment.remediation_plan_id]
        );
      }
      if (outcome.next === "REVIEWS") {
        await createReviewSchedules(client,assessment,config.review);
        await client.query(
          `UPDATE student_skill_profiles SET next_review_date=(SELECT MIN(scheduled_for)
             FROM review_schedules WHERE remediation_plan_id=$3 AND status IN ('PENDING','DUE'))
           WHERE student_id=$1 AND taxonomy_id=$2`,
          [studentId,assessment.taxonomy_id,assessment.remediation_plan_id]
        );
      }
      if (outcome.next === "EXTENDED_REVIEW") {
        await createExtendedReviewSchedule(client,assessment);
        await client.query(
          `UPDATE student_skill_profiles SET next_review_date=(SELECT MIN(scheduled_for)
             FROM review_schedules WHERE remediation_plan_id=$3 AND status IN ('PENDING','DUE'))
           WHERE student_id=$1 AND taxonomy_id=$2`,
          [studentId,assessment.taxonomy_id,assessment.remediation_plan_id]
        );
      }
      if (["LESSON_REVIEW", "DONE"].includes(outcome.next)) {
        await client.query(
          `UPDATE review_schedules SET status='CANCELLED',updated_at=NOW()
           WHERE remediation_plan_id=$1 AND status IN ('PENDING','DUE')`, [assessment.remediation_plan_id]
        );
      }
      await client.query(
        `UPDATE ai_reports SET is_stale=true,stale_at=NOW() WHERE target_student_id=$1 AND is_stale=false`,
        [studentId]
      );
      await client.query("COMMIT");
      nextAction = { outcome,assessment,successfulRetests: Number(counters.rows[0].successful_retests) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (nextAction.outcome.next === "RETEST") {
      await ensureAssessment(studentId,nextAction.assessment.remediation_plan_id,"RETEST",
        Number(nextAction.assessment.sequence_no) + 1,new Date(now().getTime() + 86400000));
    }
    return getAssessment(studentId,assessmentId);
  }

  async function syncStudentAssessments(studentId) {
    const plans = await pool.query(
      `SELECT id,status FROM remediation_plans WHERE student_id=$1 AND status='RETEST_PENDING'`, [studentId]
    );
    for (const plan of plans.rows) {
      const count = await pool.query(
        `SELECT COUNT(*)::int AS count FROM targeted_retests
         WHERE remediation_plan_id=$1 AND assessment_type='RETEST'`, [plan.id]
      );
      if (!Number(count.rows[0].count)) await ensureInitialRetest(studentId,plan.id);
    }
    const schedules = await pool.query(
      `SELECT * FROM review_schedules WHERE student_id=$1 AND status='PENDING' AND scheduled_for<=NOW()
       ORDER BY scheduled_for LIMIT 10`, [studentId]
    );
    for (const schedule of schedules.rows) {
      await ensureAssessment(studentId,schedule.remediation_plan_id,"REVIEW",schedule.sequence_no,schedule.scheduled_for);
    }
    return { retest_plans: plans.rows.length, due_reviews: schedules.rows.length };
  }

  async function getProgressOverview(studentId) {
    const [overviewResult,weaknessResult,timelineResult] = await Promise.all([
      pool.query(
        `WITH scoped_profiles AS (
           SELECT p.* FROM student_skill_profiles p
           WHERE p.student_id=$1 AND (
             p.taxonomy_level='micro_skill' OR NOT EXISTS (
               SELECT 1 FROM student_skill_profiles micro
               WHERE micro.student_id=$1 AND micro.taxonomy_level='micro_skill'
             )
           )
         )
         SELECT
           (SELECT COUNT(*)::int FROM student_answer_events
            WHERE student_id=$1 AND question_diagnostic_eligible=true) AS reliable_attempts,
           ROUND(COALESCE(AVG(mastery_score),0),2)::float AS current_mastery,
           ROUND(COALESCE(AVG(confidence_score),0),2)::float AS confidence,
           COUNT(*) FILTER (WHERE current_evidence_state IN ('REMEDIATING','IMPROVING'))::int AS skills_improving,
           COALESCE(SUM(repeated_misconception_count),0)::int AS repeated_mistakes,
           (SELECT COUNT(*)::int FROM personalized_lessons
            WHERE student_id=$1 AND status='COMPLETED') AS completed_lessons,
           (SELECT COUNT(*)::int FROM targeted_retests
            WHERE student_id=$1 AND status IN ('READY','STARTED') AND scheduled_for<=NOW()) AS reviews_due
         FROM scoped_profiles`,
        [studentId]
      ),
      pool.query(
        `WITH scoped_profiles AS (
           SELECT p.* FROM student_skill_profiles p
           WHERE p.student_id=$1 AND (
             p.taxonomy_level='micro_skill' OR NOT EXISTS (
               SELECT 1 FROM student_skill_profiles micro
               WHERE micro.student_id=$1 AND micro.taxonomy_level='micro_skill'
             )
           )
         )
         SELECT p.taxonomy_id,t.name AS skill_name,parent.name AS parent_skill_name,
                p.current_evidence_state,p.mastery_score::float,p.confidence_score::float,
                p.repeated_misconception_count,p.current_priority::float
         FROM scoped_profiles p JOIN learning_taxonomy t ON t.id=p.taxonomy_id
         LEFT JOIN learning_taxonomy parent ON parent.id=t.parent_id
         WHERE p.current_evidence_state NOT IN ('MASTERED','STABLE')
         ORDER BY p.current_priority DESC,p.updated_at DESC LIMIT 8`,
        [studentId]
      ),
      pool.query(
        `SELECT h.id,h.event_type,h.from_status,h.to_status,h.event_payload,h.created_at,
                t.name AS skill_name,parent.name AS parent_skill_name
         FROM remediation_history h JOIN remediation_plans p ON p.id=h.remediation_plan_id
         JOIN learning_taxonomy t ON t.id=p.taxonomy_id
         LEFT JOIN learning_taxonomy parent ON parent.id=t.parent_id
         WHERE h.student_id=$1 ORDER BY h.created_at DESC,h.id DESC LIMIT 30`,
        [studentId]
      ),
    ]);
    return {
      overview: overviewResult.rows[0] || {},
      exact_weaknesses: weaknessResult.rows,
      timeline: timelineResult.rows,
    };
  }

  async function processDueReviews(limit = 25) {
    const schedules = await pool.query(
      `SELECT * FROM review_schedules WHERE status='PENDING' AND scheduled_for<=NOW()
       ORDER BY scheduled_for LIMIT $1`, [limit]
    );
    for (const schedule of schedules.rows) {
      await ensureAssessment(schedule.student_id,schedule.remediation_plan_id,"REVIEW",
        schedule.sequence_no,schedule.scheduled_for);
    }
    return schedules.rows.length;
  }

  async function notifyDueAssessments(limit = 50) {
    if (typeof createNotification !== "function") return 0;
    let sent = 0;
    for (let index = 0; index < limit; index++) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT r.id,r.student_id,r.assessment_type,t.name AS skill_name
           FROM targeted_retests r JOIN learning_taxonomy t ON t.id=r.taxonomy_id
           WHERE r.status='READY' AND r.scheduled_for<=NOW() AND r.notification_sent_at IS NULL
           ORDER BY r.scheduled_for FOR UPDATE OF r SKIP LOCKED LIMIT 1`
        );
        const assessment = result.rows[0];
        if (!assessment) {
          await client.query("COMMIT");
          break;
        }
        const label = assessment.assessment_type === "RETEST" ? "qayta tekshiruv" : "takrorlash";
        const success = await createNotification(assessment.student_id,"learning_review_due",
          `${assessment.skill_name} bo'yicha ${label} tayyor.`,client);
        if (!success) throw new Error("Review notification could not be persisted");
        await client.query(
          `UPDATE targeted_retests SET notification_sent_at=NOW(),updated_at=NOW() WHERE id=$1`,
          [assessment.id]
        );
        await client.query("COMMIT");
        sent++;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return sent;
  }

  async function processBatchSafe() {
    try {
      const reviews = await processDueReviews();
      const notifications = await notifyDueAssessments();
      return { reviews,notifications };
    } catch (error) {
      logger.error("Retest/review worker xatosi:", error.message);
      return { reviews: 0,notifications: 0,error: error.message };
    }
  }

  function startWorker(intervalMs = 60000) {
    if (timer) return timer;
    setImmediate(() => processBatchSafe());
    timer = setInterval(() => processBatchSafe(),intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    return timer;
  }

  function stopWorker() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    loadConfig,ensureInitialRetest,syncStudentAssessments,listDue,getAssessment,
    startAssessment,answerQuestion,completeAssessment,processDueReviews,
    notifyDueAssessments,processBatchSafe,startWorker,stopWorker,getProgressOverview,
  };
}

module.exports = {
  RETEST_SCHEMA_VERSION,REVIEW_SCHEMA_VERSION,DEFAULT_REVIEW_CONFIG,
  assessmentQuality,makeAssessmentExercises,determineAssessmentOutcome,reviewAdjustment,calculateAssessmentProfile,
  createLearningReviewService,
};
