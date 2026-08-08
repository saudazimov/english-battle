const VALID_SOURCE_MODES = new Set([
  "battle",
  "teacher_assignment",
  "practice",
  "placement_exam",
  "level_exam",
  "class_exam",
  "personalized_lesson",
  "targeted_retest",
  "spaced_review",
]);

const { scheduleSkillProfileUpdates } = require("./learningAnalyticsService");

function positiveInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function normalizeOption(value) {
  if (value === null || value === undefined || value === "") return null;
  const option = String(value).trim().toUpperCase();
  return option.length <= 10 ? option : null;
}

function normalizeEvent(input) {
  const studentId = positiveInteger(input.studentId);
  const sourceMode = String(input.sourceMode || "").trim();
  const sourceRecordId = String(input.sourceRecordId || "").trim();
  const sourceQuestionId = positiveInteger(input.sourceQuestionId || input.questionId);
  const attemptNumber = positiveInteger(input.attemptNumber, 1);
  if (!studentId || !VALID_SOURCE_MODES.has(sourceMode)) {
    throw new TypeError("Invalid diagnostic answer-event identity");
  }
  if (!sourceRecordId || sourceRecordId.length > 200 || !sourceQuestionId) {
    throw new TypeError("Invalid diagnostic answer-event source");
  }
  if (typeof input.isCorrect !== "boolean") {
    throw new TypeError("Diagnostic answer-event correctness is required");
  }

  return {
    studentId,
    questionId: positiveInteger(input.questionId),
    sourceMode,
    sourceRecordId,
    sourceQuestionId,
    selectedOption: normalizeOption(input.selectedOption),
    correctOption: normalizeOption(input.correctOption),
    isCorrect: input.isCorrect,
    timedOut: Boolean(input.timedOut),
    responseTimeMs: nonNegativeInteger(input.responseTimeMs),
    attemptNumber,
    hintUsed: Boolean(input.hintUsed),
    explanationViewedBeforeAnswer: Boolean(input.explanationViewedBeforeAnswer),
    detectedCefrLevel: input.detectedCefrLevel || null,
    legacySkill: input.legacySkill || null,
    mainSkillId: positiveInteger(input.mainSkillId),
    topicId: positiveInteger(input.topicId),
    subskillId: positiveInteger(input.subskillId),
    microSkillId: positiveInteger(input.microSkillId),
    selectedDistractorErrorCode: input.selectedDistractorErrorCode || null,
    questionDiagnosticEligible: Boolean(input.questionDiagnosticEligible),
    questionAnalysisVersion: input.questionAnalysisVersion || null,
    skillStateBefore: input.skillStateBefore || null,
    skillStateAfter: input.skillStateAfter || null,
    eventMetadata: input.eventMetadata || {},
    answeredAt: input.answeredAt || new Date(),
    idempotencyKey: [
      sourceMode,
      studentId,
      sourceRecordId,
      sourceQuestionId,
      attemptNumber,
    ].join(":"),
  };
}

const UPSERT_SQL = `INSERT INTO student_answer_events (
  student_id, question_id, source_mode, source_record_id, source_question_id,
  selected_option, correct_option, is_correct, timed_out, response_time_ms,
  attempt_number, hint_used, explanation_viewed_before_answer,
  detected_cefr_level, legacy_skill, main_skill_id, topic_id, subskill_id,
  micro_skill_id, selected_distractor_error_code, question_diagnostic_eligible,
  question_analysis_version, skill_state_before, skill_state_after,
  event_metadata, answered_at, idempotency_key
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
  $20,$21,$22,$23,$24,$25,$26,$27
)
ON CONFLICT (idempotency_key) DO UPDATE SET
  answer_changed = student_answer_events.answer_changed
    OR student_answer_events.selected_option IS DISTINCT FROM EXCLUDED.selected_option,
  change_count = student_answer_events.change_count
    + CASE WHEN student_answer_events.selected_option IS DISTINCT FROM EXCLUDED.selected_option THEN 1 ELSE 0 END,
  selected_option = EXCLUDED.selected_option,
  correct_option = EXCLUDED.correct_option,
  is_correct = EXCLUDED.is_correct,
  timed_out = EXCLUDED.timed_out,
  response_time_ms = COALESCE(EXCLUDED.response_time_ms, student_answer_events.response_time_ms),
  hint_used = student_answer_events.hint_used OR EXCLUDED.hint_used,
  explanation_viewed_before_answer = student_answer_events.explanation_viewed_before_answer
    OR EXCLUDED.explanation_viewed_before_answer,
  detected_cefr_level = COALESCE(EXCLUDED.detected_cefr_level, student_answer_events.detected_cefr_level),
  legacy_skill = COALESCE(EXCLUDED.legacy_skill, student_answer_events.legacy_skill),
  main_skill_id = COALESCE(EXCLUDED.main_skill_id, student_answer_events.main_skill_id),
  topic_id = COALESCE(EXCLUDED.topic_id, student_answer_events.topic_id),
  subskill_id = COALESCE(EXCLUDED.subskill_id, student_answer_events.subskill_id),
  micro_skill_id = COALESCE(EXCLUDED.micro_skill_id, student_answer_events.micro_skill_id),
  selected_distractor_error_code = COALESCE(EXCLUDED.selected_distractor_error_code, student_answer_events.selected_distractor_error_code),
  question_diagnostic_eligible = EXCLUDED.question_diagnostic_eligible,
  question_analysis_version = COALESCE(EXCLUDED.question_analysis_version, student_answer_events.question_analysis_version),
  skill_state_before = COALESCE(student_answer_events.skill_state_before, EXCLUDED.skill_state_before),
  skill_state_after = COALESCE(EXCLUDED.skill_state_after, student_answer_events.skill_state_after),
  event_metadata = student_answer_events.event_metadata || EXCLUDED.event_metadata,
  answered_at = EXCLUDED.answered_at,
  updated_at = NOW()
RETURNING *`;

function values(event) {
  return [
    event.studentId, event.questionId, event.sourceMode, event.sourceRecordId,
    event.sourceQuestionId, event.selectedOption, event.correctOption,
    event.isCorrect, event.timedOut, event.responseTimeMs, event.attemptNumber,
    event.hintUsed, event.explanationViewedBeforeAnswer,
    event.detectedCefrLevel, event.legacySkill, event.mainSkillId,
    event.topicId, event.subskillId, event.microSkillId,
    event.selectedDistractorErrorCode, event.questionDiagnosticEligible,
    event.questionAnalysisVersion, event.skillStateBefore, event.skillStateAfter,
    JSON.stringify(event.eventMetadata), event.answeredAt, event.idempotencyKey,
  ];
}

async function invalidateReports(db, studentId) {
  await db.query(
    `UPDATE ai_reports SET is_stale=true, stale_at=NOW()
     WHERE target_student_id=$1 AND is_stale=false`,
    [studentId]
  );
}

async function enrichQuestionMetadata(pool, events, logger) {
  const questionIds = [...new Set(events.map((event) => positiveInteger(event.questionId)).filter(Boolean))];
  if (!questionIds.length) return events;
  try {
    const result = await pool.query(
      `SELECT a.question_id, a.estimated_level, a.main_skill_id, a.topic_id,
              a.subskill_id, a.micro_skill_id, a.analysis_version,
              a.diagnostic_eligible, d.option_code, d.error_code
       FROM question_ai_analysis a
       LEFT JOIN question_distractor_analysis d ON d.question_id=a.question_id
       WHERE a.question_id = ANY($1::int[]) AND a.diagnostic_eligible=true`,
      [questionIds]
    );
    const metadata = new Map();
    for (const row of result.rows) {
      if (!metadata.has(row.question_id)) metadata.set(row.question_id, { ...row, distractors: new Map() });
      if (row.option_code) metadata.get(row.question_id).distractors.set(row.option_code, row.error_code);
    }
    return events.map((event) => {
      const questionId = positiveInteger(event.questionId);
      const match = metadata.get(questionId);
      if (!match) return event;
      const selected = normalizeOption(event.selectedOption);
      return {
        ...event,
        detectedCefrLevel: match.estimated_level || event.detectedCefrLevel,
        mainSkillId: match.main_skill_id || event.mainSkillId,
        topicId: match.topic_id || event.topicId,
        subskillId: match.subskill_id || event.subskillId,
        microSkillId: match.micro_skill_id || event.microSkillId,
        selectedDistractorErrorCode: match.distractors.get(selected) || event.selectedDistractorErrorCode,
        questionDiagnosticEligible: match.diagnostic_eligible,
        questionAnalysisVersion: String(match.analysis_version || event.questionAnalysisVersion || "") || null,
      };
    });
  } catch (error) {
    logger.error("Question diagnostic metadata yuklash xato:", error.message);
    return events;
  }
}

function createAnswerEventService({
  pool,
  logger = console,
  enrichMetadata = true,
  scheduleProfiles = scheduleSkillProfileUpdates,
}) {
  async function recordMany(events) {
    if (!Array.isArray(events) || events.length === 0) return [];
    const enriched = enrichMetadata ? await enrichQuestionMetadata(pool, events, logger) : events;
    const normalized = enriched.map(normalizeEvent);
    const studentIds = new Set(normalized.map((event) => event.studentId));
    if (typeof pool.connect !== "function") {
      const saved = [];
      for (const event of normalized) {
        const result = await pool.query(UPSERT_SQL, values(event));
        saved.push(result.rows && result.rows[0]);
      }
      for (const studentId of studentIds) await invalidateReports(pool, studentId);
      await scheduleProfiles(pool, saved, logger);
      return saved;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved = [];
      for (const event of normalized) {
        const result = await client.query(UPSERT_SQL, values(event));
        saved.push(result.rows[0]);
      }
      for (const studentId of studentIds) await invalidateReports(client, studentId);
      await client.query("COMMIT");
      await scheduleProfiles(pool, saved, logger);
      return saved;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function recordManySafe(events) {
    try {
      return await recordMany(events);
    } catch (error) {
      logger.error("Diagnostic answer-event yozish xato:", error.message);
      return [];
    }
  }

  async function recordOneSafe(event) {
    const saved = await recordManySafe([event]);
    return saved[0] || null;
  }

  return { recordMany, recordManySafe, recordOneSafe };
}

module.exports = {
  VALID_SOURCE_MODES,
  createAnswerEventService,
  normalizeEvent,
  enrichQuestionMetadata,
};
