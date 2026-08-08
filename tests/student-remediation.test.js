const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LESSON_SCHEMA_VERSION,
  isApprovedExercise,
  makeExercises,
  fallbackLesson,
  normalizeAiLesson,
  resolveGeneratedLesson,
} = require("../src/services/personalizedLessonService");
const {
  createStudentRemediationController,
  positiveInteger,
} = require("../src/controllers/studentRemediationController");

function question(overrides = {}) {
  return {
    id: 11,
    question_text: "She ___ English every day.",
    option_a: "study",
    option_b: "studies",
    option_c: "studying",
    option_d: "studied",
    correct_option: "B",
    explanation: "Third-person singular takes -s.",
    diagnostic_eligible: true,
    cefr_level: "A1",
    question_type: "gap_fill",
    ...overrides,
  };
}

function target() {
  return {
    taxonomy_id: 7,
    skill_name: "Present Simple",
    legacy_skill: "grammar.present_simple",
    taxonomy_description: "Present Simple qoidasi",
    evidence_state: "CONFIRMED",
    confidence: 0.82,
    priority: 78,
    mastery_score: 41,
    occurrence_count: 4,
    evidence: { incorrect: 4 },
  };
}

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("exercise quality accepts only diagnostic, unique, level-safe new questions", () => {
  const originals = new Set(["i am learning english."]);
  assert.equal(isApprovedExercise(question(), originals, "A1"), true);
  assert.equal(isApprovedExercise(question({ diagnostic_eligible: false }), originals, "A1"), false);
  assert.equal(isApprovedExercise(question({ option_d: "studies" }), originals, "A1"), false);
  assert.equal(isApprovedExercise(question({ cefr_level: "B2" }), originals, "A1"), false);
  assert.equal(isApprovedExercise(question({ question_text: "I am learning English." }), originals, "A1"), false);
});

test("fallback lesson is evidence-bound and contains approved practice sections", () => {
  const exercises = makeExercises([
    question({ id: 1 }), question({ id: 2, question_text: "He ___ at school." }),
    question({ id: 3, question_text: "Aziza ___ books." }), question({ id: 4, question_text: "My friend ___ tea." }),
    question({ id: 5, question_text: "The cat ___ milk." }),
  ]);
  const lesson = fallbackLesson(target(), [{
    question_text: "He go to school.", selected_answer: "go", correct_answer: "goes",
    explanation: "He bilan fe'lga -s qo'shiladi.",
  }], exercises);

  assert.equal(lesson.schema_version, LESSON_SCHEMA_VERSION);
  assert.equal(lesson.target_skill_id, 7);
  assert.equal(lesson.fallback_template.version, "approved_fallback_lesson_v1");
  assert.equal(lesson.fallback_template.rule_source, "approved_question_explanation");
  assert.equal(lesson.student_error_examples[0].selected_answer, "go");
  assert.equal(lesson.guided_practice.length, 2);
  assert.equal(lesson.final_check.length, 1);
  assert.deepEqual(lesson.review_plan.map((item) => item.delay_days), [0, 1, 3, 7, 21]);
  assert.deepEqual(lesson.mastery_criteria, {
    required_correct: 8, total_questions: 10, required_successful_attempts: 2,
  });
});

test("fallback lesson uses the versioned approved template when stored rules are unavailable", () => {
  const lesson = fallbackLesson({
    ...target(),
    taxonomy_description: "",
  }, [], []);

  assert.equal(lesson.fallback_template.category, "grammar");
  assert.equal(lesson.fallback_template.rule_source, "approved_template");
  assert.match(lesson.micro_explanation.rule, /grammatik qoidani/);
});

test("AI failure does not block the deterministic personalized lesson", async () => {
  const fallback = fallbackLesson(target(), [], []);
  const logged = [];
  const result = await resolveGeneratedLesson({
    aiService: {
      async generatePersonalizedLesson() {
        throw new Error("provider unavailable");
      },
    },
    target: target(),
    fallback,
    logger: { error(...args) { logged.push(args); } },
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.lesson, fallback);
  assert.deepEqual(result.warnings, ["AI_GENERATION_FAILED"]);
  assert.equal(logged.length, 1);
});

test("AI lesson normalization cannot change target or official practice evidence", () => {
  const official = fallbackLesson(target(), [], makeExercises([question()]));
  const candidate = {
    schema_version: LESSON_SCHEMA_VERSION,
    target_skill_id: 7,
    lesson_title: "Shaxsiy Present Simple darsi",
    learning_objective: "Qoidani yangi gaplarda qo'llash.",
    diagnostic_summary: { student_message: "Takroriy xato topildi.", teacher_message: "AI taxmini" },
    micro_explanation: { rule: "He/she/it bilan -s qo'shiladi.", examples: [] },
    worked_examples: [{ prompt: "He go.", incorrect: "go", correct: "goes", reasoning: "He uchinchi shaxs." }],
  };
  const normalized = normalizeAiLesson(candidate, target(), official);
  assert.equal(normalized.target_skill_id, 7);
  assert.deepEqual(normalized.guided_practice, official.guided_practice);
  assert.equal(normalized.diagnostic_summary.teacher_message, official.diagnostic_summary.teacher_message);
  assert.equal(normalizeAiLesson({ ...candidate, target_skill_id: 999 }, target(), official), null);
});

test("controller validates IDs and blocks incomplete lesson completion", async () => {
  assert.equal(positiveInteger("9"), 9);
  assert.equal(positiveInteger("0"), null);
  const controller = createStudentRemediationController({
    lessonService: {
      async completeLesson() { return { incomplete: true, answered: 2, total: 5 }; },
    },
    logger: { error() {} },
  });
  const invalid = responseHarness();
  await controller.complete({ user: { id: 4 }, params: { lessonId: "bad" } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const incomplete = responseHarness();
  await controller.complete({ user: { id: 4 }, params: { lessonId: "12" } }, incomplete);
  assert.equal(incomplete.statusCode, 409);
  assert.deepEqual(incomplete.body, {
    error: "Darsni yakunlashdan oldin barcha mashqlarga javob bering.", answered: 2, total: 5,
  });
});
