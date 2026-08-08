const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SUCCESS_CRITERIA,
  buildSuccessCriteria,
  createLearningDiagnosticsSuccessService,
} = require("../src/services/learningDiagnosticsSuccessService");

function passingEvidence() {
  return {
    student_count: 6,
    question_count: 24,
    minimal_question_count: 24,
    analyzed_question_count: 24,
    processed_question_count: 24,
    source_modes: ["battle", "class_exam", "practice", "teacher_assignment"],
    answer_count: 44,
    detailed_answer_count: 44,
    metadata_answer_count: 44,
    profile_count: 6,
    recurring_finding_count: 6,
    evidence_states: ["CONFIRMED", "IMPROVING", "MASTERED", "REGRESSED", "STABLE"],
    stale_report_count: 1,
    fresh_report_count: 1,
    lesson_count: 2,
    completed_lesson_count: 2,
    lesson_attempt_count: 6,
    ten_question_assessment_count: 8,
    completed_assessment_count: 8,
    mastery_update_count: 13,
    review_intervals: [1, 3, 7, 21],
    pending_21_day_count: 2,
    reminder_count: 2,
    completed_review_count: 6,
    retention_profile_count: 2,
    outcome_states: ["IMPROVING", "MASTERED", "REGRESSED", "STABLE"],
    teacher_evidence_count: 6,
    shared_weakness_count: 3,
    fallback_lesson_count: 2,
    fallback_event_count: 2,
    isolated_question_count: 24,
    plan_count: 2,
  };
}

test("success verifier represents all 25 required end-to-end criteria", () => {
  assert.equal(SUCCESS_CRITERIA.length, 25);
  const criteria = buildSuccessCriteria(passingEvidence());
  assert.equal(criteria.length, 25);
  assert.ok(criteria.every((item, index) => item.id === index + 1));
  assert.ok(criteria.every((item) => item.passed));
});

test("success verifier fails closed when a required review interval is missing", () => {
  const evidence = passingEvidence();
  evidence.review_intervals = [1, 3, 7];
  const criteria = buildSuccessCriteria(evidence);
  assert.equal(criteria[17].key, "SC-18");
  assert.equal(criteria[17].passed, false);
});

test("success service uses one parameterized evidence query", async () => {
  const calls = [];
  const service = createLearningDiagnosticsSuccessService({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows: [passingEvidence()] };
      },
    },
  });
  const result = await service.verify();
  assert.equal(result.passed, true);
  assert.equal(result.passedCount, 25);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /WITH demo_users AS/);
  assert.equal(calls[0][1].length, 6);
});
