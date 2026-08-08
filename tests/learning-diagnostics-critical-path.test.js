const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeEvent } = require("../src/services/answerEventService");
const { detectLearningPatterns } = require("../src/services/patternDetectionService");
const {
  calculateConfidence,
  calculateMastery,
  calculatePriority,
  determineEvidenceState,
} = require("../src/services/learningAnalyticsService");
const { fallbackLesson } = require("../src/services/personalizedLessonService");
const { determineAssessmentOutcome } = require("../src/services/learningReviewService");

function diagnosticEvent({ questionId, sourceMode, sourceRecordId, isCorrect, questionType }) {
  const event = normalizeEvent({
    studentId: 41,
    questionId,
    sourceMode,
    sourceRecordId,
    sourceQuestionId: questionId,
    selectedOption: isCorrect ? "B" : "A",
    correctOption: "B",
    isCorrect,
    responseTimeMs: 9000,
    mainSkillId: 1,
    topicId: 7,
    subskillId: 11,
    selectedDistractorErrorCode: isCorrect ? null : "THIRD_PERSON_S_MISSING",
    questionDiagnosticEligible: true,
    questionAnalysisVersion: "question_analysis_v1",
  });
  return {
    ...event,
    question_key: String(questionId),
    source_mode: event.sourceMode,
    source_record_id: event.sourceRecordId,
    is_correct: event.isCorrect,
    response_time_ms: event.responseTimeMs,
    selected_distractor_error_code: event.selectedDistractorErrorCode,
    question_diagnostic_eligible: event.questionDiagnosticEligible,
    question_type: questionType,
    analysis_quality: 0.9,
    main_skill_name: "Grammar",
  };
}

test("multi-source mistakes progress through remediation, review, mastery and regression", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");
  const events = [
    diagnosticEvent({ questionId: 101, sourceMode: "battle", sourceRecordId: "battle-1", isCorrect: false, questionType: "gap_fill" }),
    diagnosticEvent({ questionId: 102, sourceMode: "practice", sourceRecordId: "practice-1", isCorrect: false, questionType: "multiple_choice" }),
    diagnosticEvent({ questionId: 103, sourceMode: "teacher_assignment", sourceRecordId: "assignment-1", isCorrect: false, questionType: "sentence_transform" }),
    diagnosticEvent({ questionId: 104, sourceMode: "battle", sourceRecordId: "battle-1", isCorrect: true, questionType: "gap_fill" }),
    diagnosticEvent({ questionId: 105, sourceMode: "practice", sourceRecordId: "practice-1", isCorrect: true, questionType: "multiple_choice" }),
    diagnosticEvent({ questionId: 106, sourceMode: "teacher_assignment", sourceRecordId: "assignment-1", isCorrect: true, questionType: "sentence_transform" }),
  ];

  assert.deepEqual(
    new Set(events.map((event) => event.sourceMode)),
    new Set(["battle", "practice", "teacher_assignment"])
  );
  assert.equal(new Set(events.map((event) => event.idempotencyKey)).size, events.length);

  const detection = detectLearningPatterns(events, {
    taxonomyLevel: "topic",
    expectedResponseTimeMs: 20000,
  });
  const repeated = detection.findings.find((item) => item.findingType === "REPEATED_DISTRACTOR");
  assert.ok(repeated);
  assert.equal(repeated.state, "CONFIRMED");
  assert.equal(repeated.recommendedAction, "CREATE_TARGETED_PRACTICE");

  const stats = {
    exposures: 6,
    incorrect: 3,
    distinctQuestions: 6,
    sessions: 3,
    formats: 3,
    weightedAccuracy: 50,
    errorRate: 50,
    analysisQuality: 0.9,
    retentionScore: 0,
    averageResponseTimeMs: 9000,
    expectedResponseTimeMs: 20000,
    hintUsageRate: 0,
    repeatedMisconceptions: 3,
    regressionFlag: false,
    lastAttempt: now,
    lastIncorrectAttempt: now,
    consistency: 0.9,
  };
  stats.confidenceScore = calculateConfidence(stats, undefined, now);
  stats.masteryScore = calculateMastery(stats);
  const evidenceState = determineEvidenceState(stats);
  const priority = calculatePriority(stats, evidenceState, undefined, now);
  assert.equal(evidenceState, "CONFIRMED");
  assert.ok(priority > 0);

  const lesson = fallbackLesson({
    taxonomy_id: 7,
    skill_name: "Present Simple: third-person singular",
    legacy_skill: "grammar.present_simple",
    taxonomy_description: "He, she va it bilan fe'lga -s qo'shiladi.",
    evidence_state: evidenceState,
    confidence: stats.confidenceScore / 100,
    priority,
    occurrence_count: repeated.occurrenceCount,
    evidence: repeated.evidence,
  }, [{
    question_text: "He go to school.",
    selected_answer: "go",
    correct_answer: "goes",
    explanation: "He bilan fe'lga -s qo'shiladi.",
  }], []);
  assert.equal(lesson.target_skill_id, 7);
  assert.equal(lesson.fallback_template.rule_source, "approved_question_explanation");
  assert.deepEqual(lesson.review_plan.map((item) => item.delay_days), [0, 1, 3, 7, 21]);

  const firstRetest = determineAssessmentOutcome({
    assessmentType: "RETEST", passed: true, successfulRetests: 1,
  });
  const secondRetest = determineAssessmentOutcome({
    assessmentType: "RETEST", passed: true, successfulRetests: 2,
  });
  const mastered = determineAssessmentOutcome({
    assessmentType: "REVIEW", passed: true, sequenceNo: 5,
    successfulRetests: 2, failedReviews: 0, priorPlanStatus: secondRetest.evidenceState,
    masteryScore: 90, confidenceScore: 80, retentionScore: 90,
  });
  const regressed = determineAssessmentOutcome({
    assessmentType: "REVIEW", passed: false, sequenceNo: 6,
    successfulRetests: 2, failedReviews: 1, priorPlanStatus: mastered.planStatus,
  });

  assert.deepEqual(firstRetest, {
    planStatus: "RETEST_PENDING", evidenceState: "IMPROVING", next: "RETEST",
  });
  assert.deepEqual(secondRetest, {
    planStatus: "REVIEW_PENDING", evidenceState: "STABLE", next: "REVIEWS",
  });
  assert.deepEqual(mastered, {
    planStatus: "MASTERED", evidenceState: "MASTERED", next: "DONE",
  });
  assert.deepEqual(regressed, {
    planStatus: "REGRESSED", evidenceState: "REGRESSED", next: "LESSON_REVIEW",
  });
});
