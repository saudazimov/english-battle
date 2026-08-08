const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEMO_CASES,
  DEMO_MARKER,
  DEMO_STUDENTS,
  DEMO_USERNAME_PREFIX,
  QUESTION_GROUPS,
  TIMELINE_OFFSETS,
  assertDemoEnvironment,
  buildDemoSummary,
  validateDemoManifest,
} = require("../src/services/learningDiagnosticsDemoService");

test("demo manifest covers every required learning diagnostics scenario", () => {
  assert.equal(validateDemoManifest(), true);
  assert.deepEqual(DEMO_CASES, [
    "present_simple_misconception",
    "careless_timed_errors",
    "vocabulary_gap",
    "reading_paraphrase_weakness",
    "improves_after_lesson",
    "regresses_after_mastery",
    "class_shared_weakness",
    "ambiguous_question",
    "possible_wrong_key",
    "ai_failure_fallback",
  ]);
  assert.equal(DEMO_STUDENTS.length, 6);
  assert.equal(QUESTION_GROUPS.present_simple.length, 10);
  assert.ok(DEMO_STUDENTS.every((student) => student.username.startsWith(DEMO_USERNAME_PREFIX)));
  assert.equal(new Set(DEMO_STUDENTS.map((student) => student.phone)).size, DEMO_STUDENTS.length);
  assert.ok(DEMO_STUDENTS.every((student) => /^\+99899000009[1-6]$/.test(student.phone)));
  assert.match(DEMO_MARKER, /^\[DEMO:/);
});

test("demo timeline preserves errors, lesson, retest, spaced reviews and regression order", () => {
  const offsets = Object.values(TIMELINE_OFFSETS);
  assert.deepEqual(offsets, [-20, -14, -13, -12, -10, -6, 7, -1]);
  assert.ok(TIMELINE_OFFSETS.originalErrors < TIMELINE_OFFSETS.lesson);
  assert.ok(TIMELINE_OFFSETS.lesson < TIMELINE_OFFSETS.retest);
  assert.ok(TIMELINE_OFFSETS.retest < TIMELINE_OFFSETS.review1);
  assert.ok(TIMELINE_OFFSETS.review1 < TIMELINE_OFFSETS.review3);
  assert.ok(TIMELINE_OFFSETS.review3 < TIMELINE_OFFSETS.review7);
  assert.ok(TIMELINE_OFFSETS.review7 < TIMELINE_OFFSETS.review21);
  assert.ok(TIMELINE_OFFSETS.review7 < TIMELINE_OFFSETS.regression);
});

test("demo question fixtures distinguish diagnostic evidence from quality review cases", () => {
  const diagnosticGroups = ["present_simple", "grammar", "vocabulary", "reading"];
  for (const group of diagnosticGroups) {
    assert.ok(QUESTION_GROUPS[group].every((question) => !question.qualityStatus));
    assert.ok(QUESTION_GROUPS[group].every((question) => question.correctOption === "A"));
  }
  assert.deepEqual(QUESTION_GROUPS.quality.map((question) => question.qualityStatus), [
    "POSSIBLY_AMBIGUOUS",
    "POSSIBLE_WRONG_KEY",
  ]);
});

test("demo execution is rejected in production", () => {
  assert.throws(() => assertDemoEnvironment("production"), /disabled in production/);
  assert.doesNotThrow(() => assertDemoEnvironment("development"));
  assert.doesNotThrow(() => assertDemoEnvironment("test"));
});

test("demo summary exposes only deterministic identifiers and required counts", () => {
  const summary = buildDemoSummary({
    teacherId: 10,
    classId: 20,
    studentIds: Object.fromEntries(DEMO_STUDENTS.map((student, index) => [student.key, index + 1])),
    questionIds: Object.fromEntries(
      Object.entries(QUESTION_GROUPS).map(([group, questions]) => [group, questions.map((_, index) => ({ id: index + 1 }))]),
    ),
  }, false);
  assert.equal(summary.committed, false);
  assert.equal(summary.studentCount, 6);
  assert.equal(summary.questionCount, 24);
  assert.equal(summary.cases.length, 10);
  assert.deepEqual(summary.timelineOffsets, TIMELINE_OFFSETS);
});
