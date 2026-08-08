const crypto = require("crypto");

const MINIMUM_ATTEMPTS = 10;

const EXPECTED_CHALLENGE = Object.freeze({
  A1: 20, A2: 32, B1: 46, B2: 60, C1: 74, C2: 86,
});

const STATUS_PRIORITY = Object.freeze({
  DISABLED: 7,
  POSSIBLE_WRONG_KEY: 6,
  POSSIBLY_AMBIGUOUS: 5,
  LEVEL_MISMATCH: 4,
  METADATA_MISMATCH: 3,
  REVIEW_SUGGESTED: 2,
  HEALTHY: 1,
});

function number(value) {
  return Number(value || 0);
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function warningSet(value) {
  if (Array.isArray(value)) return new Set(value.map(String));
  if (typeof value !== "string") return new Set();
  try {
    const parsed = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function observedChallenge(metrics, cohortResponseMs) {
  if (!metrics.attempts) return null;
  const speedRatio = metrics.average_response_time_ms && cohortResponseMs
    ? Math.min(2, metrics.average_response_time_ms / cohortResponseMs)
    : 1;
  return round(Math.min(100,
    metrics.error_rate * 0.75 + metrics.timeout_rate * 0.15 + Math.max(0, speedRatio - 1) * 10
  ));
}

function pushReason(reasons, code, label, evidence) {
  reasons.push({ code, label, evidence });
}

function classify(row, cohort) {
  const attempts = number(row.attempts);
  const incorrect = number(row.incorrect);
  const timeouts = number(row.timeouts);
  const metrics = {
    attempts,
    correct: number(row.correct),
    incorrect,
    timeouts,
    error_rate: attempts ? round(incorrect / attempts * 100) : 0,
    timeout_rate: attempts ? round(timeouts / attempts * 100) : 0,
    average_response_time_ms: row.average_response_time_ms == null
      ? null : Math.round(number(row.average_response_time_ms)),
    high_mastery_attempts: number(row.high_mastery_attempts),
    high_mastery_failures: number(row.high_mastery_failures),
    metadata_mismatches: number(row.metadata_mismatches),
    selected_options: {
      A: number(row.option_a_count), B: number(row.option_b_count),
      C: number(row.option_c_count), D: number(row.option_d_count),
    },
    cohort_error_rate: cohort.errorRate == null ? null : round(cohort.errorRate),
    cohort_average_response_time_ms: cohort.averageResponseMs == null
      ? null : Math.round(cohort.averageResponseMs),
  };
  metrics.observed_question_challenge = observedChallenge(metrics, cohort.averageResponseMs);
  const sufficient = attempts >= MINIMUM_ATTEMPTS;
  const reasons = [];
  const warnings = warningSet(row.quality_warnings);

  if (sufficient && metrics.error_rate >= 80) {
    pushReason(reasons, "ABNORMAL_ERROR_RATE", "G'ayritabiiy yuqori xatolik", `${metrics.error_rate}%`);
  }
  const masteryFailureRate = metrics.high_mastery_attempts
    ? metrics.high_mastery_failures / metrics.high_mastery_attempts * 100 : 0;
  if ((metrics.high_mastery_attempts >= 5 && masteryFailureRate >= 70)
      || warnings.has("POSSIBLE_WRONG_KEY") || warnings.has("ANSWER_KEY_CONFLICT")) {
    pushReason(reasons, "POSSIBLE_WRONG_KEY", "Javob kaliti noto'g'ri bo'lishi mumkin", `${round(masteryFailureRate)}% yuqori mastery xatosi`);
  }
  const wrongOptions = ["A", "B", "C", "D"].filter((option) => option !== row.correct_option);
  const unused = sufficient && wrongOptions.find((option) => metrics.selected_options[option] === 0);
  if (unused) pushReason(reasons, "UNUSED_DISTRACTOR", `${unused} distractor hech tanlanmagan`, `${attempts} urinish`);
  if (warnings.has("MULTIPLE_CORRECT_ANSWERS") || warnings.has("AMBIGUOUS_QUESTION")) {
    pushReason(reasons, "POSSIBLY_AMBIGUOUS", "Savolda bir nechta to'g'ri talqin bo'lishi mumkin", "AI quality warning");
  }
  if (sufficient && metrics.average_response_time_ms && cohort.averageResponseMs
      && metrics.average_response_time_ms > cohort.averageResponseMs * 1.8) {
    pushReason(reasons, "UNUSUALLY_LONG_RESPONSE", "Javob vaqti o'xshash savollardan ancha uzun", `${metrics.average_response_time_ms} ms`);
  }
  if (sufficient && cohort.errorRate != null && Math.abs(metrics.error_rate - cohort.errorRate) >= 30) {
    pushReason(reasons, "INCONSISTENT_PERFORMANCE", "O'xshash savollarga nisbatan natija keskin farq qiladi", `${round(cohort.errorRate)}% cohort xatoligi`);
  }
  if (sufficient && metrics.metadata_mismatches / attempts >= 0.3) {
    pushReason(reasons, "METADATA_MISMATCH", "Javob eventlari CEFR metadata bilan mos emas", `${round(metrics.metadata_mismatches / attempts * 100)}%`);
  }
  const expected = EXPECTED_CHALLENGE[row.cefr_level];
  if (sufficient && attempts >= 20 && expected != null
      && Math.abs(metrics.observed_question_challenge - expected) >= 30) {
    pushReason(reasons, "LEVEL_MISMATCH", "Real performance CEFR darajaga mos emas", `${metrics.observed_question_challenge} challenge`);
  }
  if (warnings.has("EXPLANATION_CONFLICT")) {
    pushReason(reasons, "EXPLANATION_CONFLICT", "Izoh javob kaliti bilan zid", "AI quality warning");
  }

  let status = "HEALTHY";
  const codes = new Set(reasons.map((reason) => reason.code));
  if ((row.status || "published") !== "published" || row.analysis_status === "DISABLED") status = "DISABLED";
  else if (codes.has("POSSIBLE_WRONG_KEY")) status = "POSSIBLE_WRONG_KEY";
  else if (codes.has("POSSIBLY_AMBIGUOUS") || codes.has("EXPLANATION_CONFLICT")) status = "POSSIBLY_AMBIGUOUS";
  else if (codes.has("LEVEL_MISMATCH")) status = "LEVEL_MISMATCH";
  else if (codes.has("METADATA_MISMATCH")) status = "METADATA_MISMATCH";
  else if (reasons.length) status = "REVIEW_SUGGESTED";

  return {
    question_id: row.id,
    question_text: row.question_text,
    cefr_level: row.cefr_level,
    skill: row.skill,
    status,
    evidence_sufficient: sufficient,
    reasons,
    metrics,
  };
}

function cohortMap(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.cefr_level || ""}:${row.skill || ""}`;
    const group = groups.get(key) || { attempts: 0, incorrect: 0, responseSum: 0, responseCount: 0 };
    group.attempts += number(row.attempts);
    group.incorrect += number(row.incorrect);
    if (row.average_response_time_ms != null && number(row.attempts)) {
      group.responseSum += number(row.average_response_time_ms) * number(row.attempts);
      group.responseCount += number(row.attempts);
    }
    groups.set(key, group);
  }
  return new Map(Array.from(groups, ([key, group]) => [key, {
    errorRate: group.attempts ? group.incorrect / group.attempts * 100 : null,
    averageResponseMs: group.responseCount ? group.responseSum / group.responseCount : null,
  }]));
}

function summarize(questions) {
  const status_counts = {};
  for (const status of Object.keys(STATUS_PRIORITY)) status_counts[status] = 0;
  for (const question of questions) status_counts[question.status] += 1;
  const flagged = questions.filter((question) => !["HEALTHY", "DISABLED"].includes(question.status))
    .sort((a, b) => STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status]
      || b.metrics.attempts - a.metrics.attempts);
  return {
    minimum_attempts: MINIMUM_ATTEMPTS,
    evaluated_questions: questions.length,
    sufficient_evidence: questions.filter((question) => question.evidence_sufficient).length,
    status_counts,
    flagged_questions: flagged.slice(0, 50),
  };
}

function flagSeverity(code) {
  if (code === "POSSIBLE_WRONG_KEY") return "critical";
  if (["POSSIBLY_AMBIGUOUS", "EXPLANATION_CONFLICT", "ABNORMAL_ERROR_RATE"].includes(code)) return "high";
  if (["LEVEL_MISMATCH", "METADATA_MISMATCH", "UNUSUALLY_LONG_RESPONSE", "INCONSISTENT_PERFORMANCE"].includes(code)) return "medium";
  return "low";
}

function snapshotHash(question) {
  return crypto.createHash("sha256").update(JSON.stringify({
    question_id: question.question_id,
    status: question.status,
    metrics: question.metrics,
    reasons: question.reasons,
  })).digest("hex");
}

function persistencePayload(questions) {
  const metrics = questions.map((question) => ({
    question_id: question.question_id,
    attempt_count: question.metrics.attempts,
    correct_count: question.metrics.correct,
    incorrect_count: question.metrics.incorrect,
    timeout_count: question.metrics.timeouts,
    average_response_time_ms: question.metrics.average_response_time_ms,
    high_mastery_attempt_count: question.metrics.high_mastery_attempts,
    high_mastery_failure_count: question.metrics.high_mastery_failures,
    metadata_mismatch_count: question.metrics.metadata_mismatches,
    option_selection_counts: question.metrics.selected_options,
    observed_question_challenge: question.metrics.observed_question_challenge,
    cohort_error_rate: question.metrics.cohort_error_rate,
    cohort_average_response_time_ms: question.metrics.cohort_average_response_time_ms,
    evidence_sufficient: question.evidence_sufficient,
    quality_status: question.status,
    source_snapshot_hash: snapshotHash(question),
  }));
  const flags = questions.flatMap((question) => question.reasons.map((reason) => ({
    question_id: question.question_id,
    flag_code: reason.code,
    severity: flagSeverity(reason.code),
    evidence: { label: reason.label, evidence: reason.evidence, metrics: question.metrics },
  })));
  return { metrics, flags };
}

async function persistEvaluation(pool, questions) {
  if (!questions.length) return { metrics: 0, flags: 0, resolved: 0 };
  const payload = persistencePayload(questions);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
           question_id int,attempt_count int,correct_count int,incorrect_count int,timeout_count int,
           average_response_time_ms int,high_mastery_attempt_count int,high_mastery_failure_count int,
           metadata_mismatch_count int,option_selection_counts jsonb,observed_question_challenge numeric,
           cohort_error_rate numeric,cohort_average_response_time_ms int,evidence_sufficient boolean,
           quality_status text,source_snapshot_hash text
         )
       )
       INSERT INTO question_quality_metrics (
         question_id,attempt_count,correct_count,incorrect_count,timeout_count,average_response_time_ms,
         high_mastery_attempt_count,high_mastery_failure_count,metadata_mismatch_count,option_selection_counts,
         observed_question_challenge,cohort_error_rate,cohort_average_response_time_ms,evidence_sufficient,
         quality_status,source_snapshot_hash
       ) SELECT question_id,attempt_count,correct_count,incorrect_count,timeout_count,average_response_time_ms,
         high_mastery_attempt_count,high_mastery_failure_count,metadata_mismatch_count,option_selection_counts,
         observed_question_challenge,cohort_error_rate,cohort_average_response_time_ms,evidence_sufficient,
         quality_status,source_snapshot_hash FROM incoming
       ON CONFLICT (question_id) DO UPDATE SET
         attempt_count=EXCLUDED.attempt_count,correct_count=EXCLUDED.correct_count,
         incorrect_count=EXCLUDED.incorrect_count,timeout_count=EXCLUDED.timeout_count,
         average_response_time_ms=EXCLUDED.average_response_time_ms,
         high_mastery_attempt_count=EXCLUDED.high_mastery_attempt_count,
         high_mastery_failure_count=EXCLUDED.high_mastery_failure_count,
         metadata_mismatch_count=EXCLUDED.metadata_mismatch_count,
         option_selection_counts=EXCLUDED.option_selection_counts,
         observed_question_challenge=EXCLUDED.observed_question_challenge,
         cohort_error_rate=EXCLUDED.cohort_error_rate,
         cohort_average_response_time_ms=EXCLUDED.cohort_average_response_time_ms,
         evidence_sufficient=EXCLUDED.evidence_sufficient,quality_status=EXCLUDED.quality_status,
         source_snapshot_hash=EXCLUDED.source_snapshot_hash,evaluated_at=NOW(),updated_at=NOW()`,
      [JSON.stringify(payload.metrics)]
    );
    if (payload.flags.length) {
      await client.query(
        `WITH incoming AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb)
             AS x(question_id int,flag_code text,severity text,evidence jsonb)
         )
         INSERT INTO question_quality_flags (question_id,flag_code,severity,evidence)
         SELECT question_id,flag_code,severity,evidence FROM incoming
         ON CONFLICT (question_id,flag_code) DO UPDATE SET
           severity=EXCLUDED.severity,evidence=EXCLUDED.evidence,
           status=CASE WHEN question_quality_flags.status='dismissed' THEN 'dismissed' ELSE 'open' END,
           last_detected_at=NOW(),resolved_at=NULL,resolved_by=NULL,resolution_note=NULL,updated_at=NOW()`,
        [JSON.stringify(payload.flags)]
      );
    }
    const resolved = await client.query(
      `UPDATE question_quality_flags existing SET status='resolved',resolved_at=NOW(),updated_at=NOW()
       WHERE existing.question_id=ANY($1::int[]) AND existing.status IN ('open','acknowledged')
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS current(question_id int,flag_code text)
           WHERE current.question_id=existing.question_id AND current.flag_code=existing.flag_code
         ) RETURNING existing.id`,
      [questions.map((question) => question.question_id), JSON.stringify(payload.flags)]
    );
    await client.query("COMMIT");
    return { metrics: payload.metrics.length, flags: payload.flags.length, resolved: resolved.rows.length };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

function createQuestionQualityService({ pool }) {
  async function loadEvaluation() {
    const result = await pool.query(
      `SELECT q.id,q.question_text,q.correct_option,q.cefr_level,q.skill,q.status,
              qa.status AS analysis_status,qa.quality_warnings,
              COUNT(e.id)::int AS attempts,
              COUNT(e.id) FILTER (WHERE e.is_correct)::int AS correct,
              COUNT(e.id) FILTER (WHERE NOT e.is_correct)::int AS incorrect,
              COUNT(e.id) FILTER (WHERE e.timed_out)::int AS timeouts,
              AVG(e.response_time_ms) FILTER (WHERE e.response_time_ms IS NOT NULL)::float AS average_response_time_ms,
              COUNT(e.id) FILTER (WHERE mastery.mastery_at_answer >= 80)::int AS high_mastery_attempts,
              COUNT(e.id) FILTER (WHERE mastery.mastery_at_answer >= 80 AND NOT e.is_correct)::int AS high_mastery_failures,
              COUNT(e.id) FILTER (WHERE e.detected_cefr_level IS NOT NULL AND e.detected_cefr_level <> q.cefr_level)::int AS metadata_mismatches,
              COUNT(e.id) FILTER (WHERE e.selected_option='A')::int AS option_a_count,
              COUNT(e.id) FILTER (WHERE e.selected_option='B')::int AS option_b_count,
              COUNT(e.id) FILTER (WHERE e.selected_option='C')::int AS option_c_count,
              COUNT(e.id) FILTER (WHERE e.selected_option='D')::int AS option_d_count
       FROM questions q
       LEFT JOIN question_ai_analysis qa ON qa.question_id=q.id
       LEFT JOIN student_answer_events e ON e.question_id=q.id
       LEFT JOIN student_skill_profiles p ON p.student_id=e.student_id
         AND p.taxonomy_id=COALESCE(e.micro_skill_id,e.subskill_id,e.topic_id,e.main_skill_id)
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           NULLIF(e.skill_state_before -> COALESCE(
             e.micro_skill_id,e.subskill_id,e.topic_id,e.main_skill_id
           )::text ->> 'mastery_score','')::numeric,
           p.mastery_score
         ) AS mastery_at_answer
       ) mastery ON true
       GROUP BY q.id,qa.status,qa.quality_warnings
       ORDER BY q.id`,
      []
    );
    const cohorts = cohortMap(result.rows);
    const questions = result.rows.map((row) => classify(
      row,
      cohorts.get(`${row.cefr_level || ""}:${row.skill || ""}`) || {}
    ));
    return { questions, summary: summarize(questions) };
  }

  async function evaluate() {
    return (await loadEvaluation()).summary;
  }

  async function evaluateAndPersist() {
    const evaluation = await loadEvaluation();
    await persistEvaluation(pool, evaluation.questions);
    return evaluation.summary;
  }

  return { evaluate, evaluateAndPersist };
}

module.exports = {
  MINIMUM_ATTEMPTS,
  EXPECTED_CHALLENGE,
  classify,
  persistencePayload,
  persistEvaluation,
  createQuestionQualityService,
};
