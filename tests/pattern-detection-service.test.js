const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectLearningPatterns,
  dominantClassification,
} = require("../src/services/patternDetectionService");

function answer(id, overrides = {}) {
  return {
    id,
    question_key: `q-${id}`,
    source_mode: "practice",
    source_record_id: `session-${Math.ceil(id / 2)}`,
    question_type: "gap_fill",
    question_diagnostic_eligible: true,
    is_correct: false,
    timed_out: false,
    response_time_ms: 12000,
    selected_distractor_error_code: null,
    analysis_quality: 0.9,
    change_count: 0,
    hint_used: false,
    main_skill_name: "Grammar",
    ...overrides,
  };
}

test("one isolated error is classified but never promoted to a confirmed finding", () => {
  const result = detectLearningPatterns([answer(1)], { expectedResponseTimeMs: 20000 });
  assert.equal(result.classifiedErrors.length, 1);
  assert.equal(result.classifiedErrors[0].classification, "KNOWLEDGE_GAP");
  assert.equal(result.findings.length, 0);
});

test("repeated distractor across questions becomes a structured misconception finding", () => {
  const result = detectLearningPatterns([
    answer(1, { selected_distractor_error_code: "THIRD_PERSON_S_MISSING" }),
    answer(2, { selected_distractor_error_code: "THIRD_PERSON_S_MISSING" }),
    answer(3, { selected_distractor_error_code: "THIRD_PERSON_S_MISSING" }),
  ], { taxonomyLevel: "subskill", expectedResponseTimeMs: 20000 });
  const repeated = result.findings.find((item) => item.findingType === "REPEATED_DISTRACTOR");
  assert.ok(repeated);
  assert.equal(repeated.classification, "MISCONCEPTION");
  assert.equal(repeated.state, "CONFIRMED");
  assert.equal(dominantClassification(result.classifiedErrors), "MISCONCEPTION");
});

test("strong untimed and weak timed performance produces time-pressure evidence", () => {
  const rows = [
    answer(1, { is_correct: true }), answer(2, { is_correct: true }), answer(3, { is_correct: true }),
    answer(4, { source_mode: "battle", is_correct: false }),
    answer(5, { source_mode: "battle", is_correct: false }),
    answer(6, { source_mode: "battle", is_correct: false }),
  ];
  const result = detectLearningPatterns(rows, { expectedResponseTimeMs: 20000 });
  const finding = result.findings.find((item) => item.findingType === "TIMED_VS_UNTIMED");
  assert.ok(finding);
  assert.equal(finding.classification, "TIME_PRESSURE_ERROR");
  assert.equal(finding.evidence.strong_group_accuracy, 100);
  assert.equal(finding.evidence.weak_group_accuracy, 0);
});

test("fast errors, timeouts, format weakness and prerequisite gap are deterministic", () => {
  const rows = [
    answer(1, { response_time_ms: 2000, timed_out: true }),
    answer(2, { response_time_ms: 2000, timed_out: true }),
    answer(3, { response_time_ms: 2000 }),
  ];
  const result = detectLearningPatterns(rows, {
    expectedResponseTimeMs: 20000,
    prerequisites: [{ taxonomy_id: 9, name: "Core verbs", mastery_score: 40, confidence_score: 70, importance: 1 }],
  });
  const types = new Set(result.findings.map((item) => item.findingType));
  assert.ok(types.has("FAST_INCORRECT"));
  assert.ok(types.has("REPEATED_TIMEOUT"));
  assert.ok(types.has("QUESTION_FORMAT_WEAKNESS"));
  assert.ok(types.has("PREREQUISITE_GAP"));
});

test("regression after mastery is explicit and high severity", () => {
  const result = detectLearningPatterns([answer(1), answer(2), answer(3)], {
    regressionFlag: true,
    expectedResponseTimeMs: 20000,
  });
  const regression = result.findings.find((item) => item.findingType === "REGRESSION");
  assert.ok(regression);
  assert.equal(regression.state, "REGRESSED");
  assert.equal(regression.severity, "high");
  assert.equal(regression.recommendedAction, "REOPEN_REMEDIATION");
});

test("strong immediate retest with weak delayed review detects retention gap", () => {
  const rows = [
    answer(1, { source_mode: "targeted_retest", is_correct: true }),
    answer(2, { source_mode: "targeted_retest", is_correct: true }),
    answer(3, { source_mode: "targeted_retest", is_correct: true }),
    answer(4, { source_mode: "spaced_review", is_correct: false }),
    answer(5, { source_mode: "spaced_review", is_correct: false }),
    answer(6, { source_mode: "spaced_review", is_correct: false }),
  ];
  const result = detectLearningPatterns(rows, { expectedResponseTimeMs: 20000 });
  const retention = result.findings.find((item) => item.findingType === "DELAYED_RETENTION_GAP");
  assert.ok(retention);
  assert.equal(retention.recommendedAction, "SHORTEN_REVIEW_INTERVAL");
});
