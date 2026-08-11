const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validatePersonalizedLessonReview,
  validatePersonalizedRuleContract,
  validatePersonalizedRuleContractReview,
  validatePersonalizedRuleContractSourceAlignment,
  normalizePersonalizedRuleContractReview,
} = require("../aiService");

const {
  LESSON_SCHEMA_VERSION,
  LESSON_EXERCISE_COUNT,
  isApprovedExercise,
  selectApprovedExercises,
  canReuseQuestionBank,
  summarizeLessonGeneration,
  makeExercises,
  grammarInUseProfile,
  fallbackLesson,
  lessonContentWarnings,
  microExplanationRuleWarnings,
  lessonMasteryRequiredCorrect,
  normalizeAiLesson,
  personalizeSharedLesson,
  reconcileLessonReview,
  resolveGeneratedLesson,
  resolveLessonWithEvidence,
  createPersonalizedLessonService,
} = require("../src/services/personalizedLessonService");
const {
  createStudentRemediationController,
  positiveInteger,
} = require("../src/controllers/studentRemediationController");
const {
  canonicalRuleTeachingConstraints,
  validCandidateForRule,
} = require("../src/services/aiRemediationExerciseService");

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

test("on-demand lesson generation reports ready, pending and review states separately", () => {
  assert.deepEqual(summarizeLessonGeneration(4, [
    { id: 1,quality_status: "APPROVED" },
    { id: 2,quality_status: "REVIEW_REQUIRED" },
    { generation_pending: true },
    null,
  ]), {
    created_count: 2,
    ready_count: 1,
    review_required_count: 1,
    pending_count: 1,
    target_count: 4,
  });
});

function target() {
  return {
    taxonomy_id: 7,
    skill_name: "Present Simple",
    legacy_skill: "grammar.present_simple",
    taxonomy_description: "Present Simple qoidasi",
    cefr_level: "A1",
    source_answer_event_id: 501,
    evidence_state: "CONFIRMED",
    confidence: 0.82,
    priority: 78,
    mastery_score: 41,
    occurrence_count: 4,
    evidence: { incorrect: 4 },
  };
}

const GENERATED_EXAMPLE_SENTENCES = [
  "She reads a book every morning.","He works at the library after school.",
  "My sister helps our mother at home.","The student answers the question clearly.",
  "Her teacher opens the classroom door.","Our friend listens to English music.",
  "His father walks through the park.","Your brother talks to the coach.",
  "Their daughter learns new words weekly.","The worker cleans the office carefully.",
];
const GENERATED_TARGET_FORMS = [
  "reads","works","helps","answers","opens","listens","walks","talks","learns","cleans",
];
const RULE_APPLICATION_TEMPLATES = [
  (form) => `${form} shakli gapdagi ega bilan grammatik moslikni ko'rsatadi.`,
  (form) => `Bu kundalik vaziyatda qoida ${form} formasi orqali ifodalangan.`,
  (form) => `${form} tanlovi gapdagi odatiy harakatga mos keladi.`,
  (form) => `Gapning ushbu kontekstida talab etilgan ko'rinish aynan ${form} bo'ladi.`,
  (form) => `Ega va kesim aloqasi sabab bu misolda ${form} ishlatilgan.`,
  (form) => `${form} formasi takrorlanadigan faoliyatni to'g'ri ifodalaydi.`,
  (form) => `Mazkur gapda qoidaning ko'rinadigan belgisi ${form} shaklidir.`,
  (form) => `Ushbu misol uchun grammatik jihatdan mos javob ${form} hisoblanadi.`,
  (form) => `${form} ko'rinishi gapning shaxs va zamon talabiga javob beradi.`,
  (form) => `Oxirgi misolda aniq qoida ${form} shaklida namoyon bo'lgan.`,
];

function ruleApplications(formOrForms) {
  const forms = Array.isArray(formOrForms)
    ? formOrForms : Array.from({ length: 10 },() => formOrForms);
  return RULE_APPLICATION_TEMPLATES.map((template,index) => template(forms[index]));
}

const DO_LESSON_SENTENCES = [
  "She does her homework every evening.","He does the housework on Saturdays.",
  "My sister does her chores before dinner.","The student does the exercises after class.",
  "Her brother does his best at school.","Our teacher does research each week.",
  "His father does the shopping on Fridays.","Your friend does the washing at home.",
  "Their mother does the laundry on Sundays.","The worker does a great job each morning.",
];

const CANONICAL_PIPELINE_LABELS = [
  "one","two","three","four","five","six","seven","eight","nine","ten",
];

function generatedLessonCandidate(overrides = {}) {
  return {
    schema_version: LESSON_SCHEMA_VERSION,
    target_skill_id: 7,
    lesson_title: "Shaxsiy Present Simple darsi",
    learning_objective: "Qoidani yangi gaplarda qo'llash.",
    diagnostic_summary: { student_message: "Takroriy xato topildi.", teacher_message: "AI taxmini" },
    micro_explanation: {
      rule: "Present Simple bo'lishli gapda uchinchi shaxs birlik uchun do fe'li does shakliga o'zgaradi.",
      examples: Array.from({ length: 10 }, (_, index) => ({
        sentence: GENERATED_EXAMPLE_SENTENCES[index],
        rule_application: ruleApplications(GENERATED_TARGET_FORMS)[index],
      })),
    },
    worked_examples: [{ prompt: "He go.", incorrect: "go", correct: "goes", reasoning: "He uchinchi shaxs." }],
    ...overrides,
  };
}

function approvedLessonReview(overrides = {}) {
  return {
    approved: true,
    confidence: 0.97,
    checks: {
      exact_rule_scope: true,
      grammatical_accuracy: true,
      uzbek_explanations: true,
      spelling_quality: true,
      examples_match_rule: true,
    },
    warnings: [],
    retry_feedback: "",
    ...overrides,
  };
}

function generatedRuleContract(overrides = {}) {
  return {
    schema_version: "personalized_rule_contract_v1",
    canonical_rule_signature: "grammar.present_simple.third_person_singular_affirmative.do_to_does",
    rule_name_uz: "Uchinchi shaxs birlikda do fe'lining does shakli",
    source_construction: {
      tense: "present simple",polarity: "affirmative",clause_type: "declarative",
      subject_constraint: "third-person singular",grammatical_function: "lexical main verb",
      base_form: "do",target_form: "does",complement_pattern: "noun object",
    },
    required_transformation: "do fe'li does shakliga o'zgaradi",
    eligibility_conditions: ["Ega uchinchi shaxs birlik bo'lishi kerak."],
    required_patterns: ["does + noun object"],
    forbidden_patterns: ["does not", "does + base verb"],
    minimal_pair: {
      valid: "She does her homework.",invalid: "She do her homework.",
      explanation_uz: "She bilan lexical do fe'li does bo'ladi.",
    },
    confidence: 0.98,
    ...overrides,
  };
}

function approvedContractReview(overrides = {}) {
  return {
    schema_version: "personalized_rule_contract_review_v2",
    approved: true,confidence: 0.97,
    checks: {
      exact_source_alignment: true,signature_coverage: true,
      adjacent_rules_excluded: true,constraints_actionable: true,
    },
    findings: [],warnings: [],retry_feedback: "",
    ...overrides,
  };
}

function ruleContractAi(overrides = {}) {
  return {
    async generatePersonalizedRuleContract() { return { contract: generatedRuleContract() }; },
    async reviewPersonalizedRuleContract() { return { review: approvedContractReview() }; },
    ...overrides,
  };
}

const CANONICAL_PIPELINE_DAYS = [
  "Monday morning", "Tuesday after lunch", "Wednesday before class",
  "Thursday at the library", "Friday with her sister", "Saturday near the park",
  "Sunday during breakfast", "school day in class", "study day at home",
  "practice day with friends",
];

const CANONICAL_PIPELINE_CASES = [
  {
    signature: "grammar.present_simple.to_be_affirmative.first_person_singular_i_am",
    base: "be", correct: "am", valid: (day) => `I am ready on ${day}.`,
    invalid: "I am studying now.", stem: (index) => `I ___ ready for lesson ${CANONICAL_PIPELINE_LABELS[index]}.`,
    options: ["am", "is", "are", "be"], correctOption: "A",
  },
  {
    signature: "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s",
    base: "read", correct: "reads", valid: (day) => `She reads a book every ${day}.`,
    invalid: "She studies English every day.", stem: (index) => `She ___ book ${CANONICAL_PIPELINE_LABELS[index]} every day.`,
    options: ["read", "reads", "reading", "readed"], correctOption: "B",
  },
  {
    signature: "grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies",
    base: "study", correct: "studies", valid: (day) => `She studies English every ${day}.`,
    invalid: "She plays tennis every day.", stem: (index) => `She ___ unit ${CANONICAL_PIPELINE_LABELS[index]} every day.`,
    options: ["study", "studies", "studys", "studying"], correctOption: "B",
  },
  {
    signature: "grammar.present_simple.third_person_singular_affirmative.vowel_y_add_s",
    base: "play", correct: "plays", valid: (day) => `She plays tennis every ${day}.`,
    invalid: "She studies English every day.", stem: (index) => `She ___ game ${CANONICAL_PIPELINE_LABELS[index]} every day.`,
    options: ["play", "plays", "plaies", "playing"], correctOption: "B",
  },
  {
    signature: "grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es",
    base: "go", correct: "goes", valid: (day) => `He goes to school every ${day}.`,
    invalid: "He does his homework every day.", stem: (index) => `He ___ to class ${CANONICAL_PIPELINE_LABELS[index]} every day.`,
    options: ["go", "goes", "gos", "going"], correctOption: "B",
  },
  {
    signature: "grammar.present_simple.third_person_singular_affirmative.verb_ending_ch_add_es",
    base: "watch", correct: "watches", valid: (day) => `She watches television every ${day}.`,
    invalid: "She washes the dishes every day.", stem: (index) => `She ___ video ${CANONICAL_PIPELINE_LABELS[index]} every day.`,
    options: ["watch", "watches", "watchs", "watching"], correctOption: "B",
  },
  {
    signature: "grammar.present_simple.third_person_singular_affirmative.verb_ending_sh_add_es",
    base: "wash", correct: "washes", valid: (day) => `She washes the dishes every ${day}.`,
    invalid: "She watches television every day.", stem: (index) => `She ___ cup ${CANONICAL_PIPELINE_LABELS[index]} every day.`,
    options: ["wash", "washes", "washs", "washing"], correctOption: "B",
  },
  {
    signature: "grammar.past_simple.affirmative.regular_verb_ed",
    base: "learn", correct: "learned", valid: (day) => `They learned English last ${day}.`,
    invalid: "They studied English yesterday.", stem: (index) => `They ___ chapter ${CANONICAL_PIPELINE_LABELS[index]} yesterday.`,
    options: ["learn", "learned", "learning", "learns"], correctOption: "B",
  },
];

function canonicalPipelineTarget(item) {
  return {
    ...target(),rule_signature: item.signature,
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 1,rule_signature_reviewed: true,
  };
}

function canonicalPipelineQuestions(item) {
  return Array.from({ length: LESSON_EXERCISE_COUNT },(_,index) => question({
    id: 1000 + index,question_text: item.stem(index),
    option_a: item.options[0],option_b: item.options[1],
    option_c: item.options[2],option_d: item.options[3],
    correct_option: item.correctOption,
    explanation: `${item.base} shakli ${item.correct} shakliga o'zgaradi.`,
  }));
}

function canonicalPipelineCandidate(item, contaminated = false) {
  const applications = ruleApplications(item.correct);
  const tense = item.signature.includes("past_simple") ? "Past Simple" : "Present Simple";
  const subject = item.signature.includes("first_person_singular")
    ? "birinchi shaxs birlik" : "uchinchi shaxs birlik";
  const examples = CANONICAL_PIPELINE_DAYS.map((day,index) => ({
    sentence: contaminated && index === 0 ? item.invalid : item.valid(day),
    rule_application: applications[index],
  }));
  return generatedLessonCandidate({
    micro_explanation: {
      rule: `${tense} bo'lishli gapda ${subject} uchun ${item.base} shakli ${item.correct} shakliga o'zgaradi.`,
      examples,
    },
  });
}

function canonicalPipelineContract(item) {
  const firstPerson = item.signature.includes("first_person_singular_i_am");
  const pastSimple = item.signature.includes("past_simple");
  const subject = firstPerson ? "I" : pastSimple ? "They" : "She";
  return generatedRuleContract({
    canonical_rule_signature: item.signature,
    source_construction: {
      ...generatedRuleContract().source_construction,
      tense: pastSimple ? "past simple" : "present simple",
      polarity: "affirmative",clause_type: "declarative",
      subject_constraint: firstPerson ? "first person singular I" : "third person singular",
      grammatical_function: firstPerson ? "copular verb" : "lexical main verb",
      base_form: item.base,target_form: item.correct,
    },
    required_transformation: `Change ${item.base} to ${item.correct}.`,
    minimal_pair: {
      valid: `${subject} ${item.correct} today.`,invalid: `${subject} ${item.base} today.`,
      explanation_uz: `${item.base} shakli ${item.correct} shakliga o'zgaradi.`,
    },
  });
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

test("approved exercise selection prefers new questions and fills gaps with prior mistakes", () => {
  const questions = Array.from({ length: 12 }, (_, index) => question({
    id: index + 1,
    question_text: index < 4
      ? `Repeated mistake ${index + 1} ___ English every day.`
      : `Fresh practice ${index + 1} ___ English every day.`,
  }));
  const originals = new Set(questions.slice(0, 4).map((item) => item.question_text.toLowerCase()));
  const selected = selectApprovedExercises(questions, originals, "A1");

  assert.equal(selected.length, 12);
  assert.deepEqual(selected.slice(0, 8).map((item) => item.id), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(selected.slice(8).map((item) => item.id), [1, 2, 3, 4]);
  assert.equal(makeExercises(selected).length, 10);
});

test("only exact micro-skill banks may be reused across learner errors", () => {
  const reviewedRule = {
    node_type: "micro_skill",
    evidence: { question_id: 381 },
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 1,
    rule_signature_reviewed: true,
  };

  assert.equal(canReuseQuestionBank(reviewedRule),true);
  assert.equal(canReuseQuestionBank({ ...reviewedRule, node_type: "subskill" }),false);
  assert.equal(canReuseQuestionBank({ ...reviewedRule, node_type: "topic" }),false);
  assert.equal(canReuseQuestionBank({ ...reviewedRule, rule_signature_reviewed: false }),false);
  assert.equal(canReuseQuestionBank({ ...reviewedRule, rule_signature_confidence: 0.89 }),false);
  assert.equal(canReuseQuestionBank({
    ...reviewedRule,
    rule_signature: "grammar.present_simple.third_person_s_affirmative",
  }),false);
  assert.equal(canReuseQuestionBank(null),false);
});

test("stored remediation bank is filtered by the exact reviewed canonical rule", () => {
  const source = fs.readFileSync(
    path.join(__dirname,"../src/services/personalizedLessonService.js"),"utf8"
  );

  assert.match(source,/qa\.rule_signature=\$2/);
  assert.match(source,/qa\.rule_signature_version=\$3/);
  assert.match(source,/qa\.rule_signature_reviewed=true/);
  assert.match(source,/qa\.rule_signature_confidence>=0\.9/);
  assert.match(source,/\[target\.taxonomy_id,bankScope\.key,bankScope\.version\]/);
});

test("fallback lesson is evidence-bound and contains approved practice sections", () => {
  const exercises = makeExercises(Array.from({ length: LESSON_EXERCISE_COUNT }, (_, index) => question({
    id: index + 1,
    question_text: `Learner ${CANONICAL_PIPELINE_LABELS[index]} ___ English every day.`,
    explanation: ruleApplications("studies")[index],
  })));
  const lesson = fallbackLesson(target(), [{
    answer_event_id: 501,
    question_text: "He go to school.", selected_answer: "go", correct_answer: "goes",
    explanation: "He bilan fe'lga -s qo'shiladi.",
  }], exercises);

  assert.equal(lesson.schema_version, LESSON_SCHEMA_VERSION);
  assert.equal(lesson.target_skill_id, 7);
  assert.equal(lesson.fallback_template.version, "approved_fallback_lesson_v1");
  assert.equal(lesson.fallback_template.rule_source, "approved_question_explanation");
  assert.equal(lesson.student_error_examples[0].selected_answer, "go");
  assert.equal(lesson.source_error.answer_event_id, 501);
  assert.equal(lesson.source_error.question, "He go to school.");
  assert.equal(lesson.source_error.correct_answer, "goes");
  assert.equal(lesson.pedagogical_profile.reference_level, "Essential Grammar in Use");
  assert.equal(lesson.pedagogical_profile.content_policy, "original_content_no_book_text_reproduced");
  assert.equal(lesson.guided_practice.length, 2);
  assert.equal(lesson.final_check.length, 1);
  assert.equal(lesson.micro_explanation.examples.length, 10);
  assert.equal(lesson.micro_explanation.examples[0].sentence.includes("___"), false);
  assert.equal(exercises.length, 10);
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
    aiService: ruleContractAi({
      async generatePersonalizedLesson() {
        throw new Error("provider unavailable");
      },
    }),
    target: target(),
    fallback,
    logger: { error(...args) { logged.push(args); } },
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.lesson, fallback);
  assert.deepEqual(result.warnings, ["AI_GENERATION_FAILED"]);
  assert.equal(logged.length, 1);
});

test("lesson quality gate blocks malformed examples and exercise prompts", () => {
  const exercises = makeExercises(Array.from({ length: LESSON_EXERCISE_COUNT }, (_, index) => question({
    id: index + 1,
    question_text: `Learner ${CANONICAL_PIPELINE_LABELS[index]} ___ English every day.`,
    explanation: ruleApplications("studies")[index],
  })));
  const lesson = fallbackLesson(target(), [], exercises);
  assert.deepEqual(lessonContentWarnings(lesson,exercises,target()),[]);

  const malformedExercises = exercises.map((exercise,index) => index === 3
    ? { ...exercise,prompt: "My dog always____ outside." } : exercise);
  const malformedLesson = fallbackLesson(target(), [], malformedExercises);
  assert.deepEqual(lessonContentWarnings(malformedLesson,malformedExercises,target()).sort(),[
    "CONTENT_EXAMPLE_FORMAT_INVALID",
    "CONTENT_EXERCISE_FORMAT_INVALID",
  ]);

  const duplicatedExercises = exercises.map((exercise,index) => index === 1
    ? { ...exercise,prompt: exercises[0].prompt.toUpperCase() }
    : exercise);
  const duplicatedLesson = fallbackLesson(target(),[],duplicatedExercises);
  assert.deepEqual(lessonContentWarnings(
    duplicatedLesson,
    duplicatedExercises,
    target()
  ).sort(),[
    "CONTENT_EXAMPLE_DUPLICATE",
    "CONTENT_EXERCISE_DUPLICATE",
  ]);
});

test("incomplete exercise evidence skips personalized lesson AI", async () => {
  const fallback = fallbackLesson(target(), [], []);
  let called = false;
  const result = await resolveLessonWithEvidence({
    aiService: {
      async generatePersonalizedLesson() {
        called = true;
        throw new Error("must not be called");
      },
    },
    target: target(),
    fallback,
    evidence: { exercises: Array.from({ length: LESSON_EXERCISE_COUNT - 1 }, () => ({})) },
  });

  assert.equal(called,false);
  assert.equal(result.source,"fallback");
  assert.equal(result.lesson,fallback);
  assert.deepEqual(result.warnings,["INSUFFICIENT_APPROVED_EXERCISES"]);
});

test("AI lesson normalization cannot change target or official practice evidence", () => {
  const officialQuestions = Array.from({ length: LESSON_EXERCISE_COUNT }, (_, index) => question({
    id: index + 1,
    question_text: `He ___ to school every day, example ${index + 1}.`,
  }));
  const official = fallbackLesson(target(), [], makeExercises(officialQuestions));
  const candidate = generatedLessonCandidate();
  const normalized = normalizeAiLesson(candidate, target(), official);
  assert.equal(normalized.target_skill_id, 7);
  assert.deepEqual(normalized.guided_practice, official.guided_practice);
  assert.equal(normalized.micro_explanation.examples.length, 10);
  assert.deepEqual(normalized.micro_explanation.examples, candidate.micro_explanation.examples);
  assert.equal(normalized.diagnostic_summary.student_message, official.diagnostic_summary.student_message);
  assert.equal(normalized.diagnostic_summary.teacher_message, official.diagnostic_summary.teacher_message);
  assert.deepEqual(normalized.worked_examples, official.worked_examples);
  assert.equal(normalizeAiLesson({ ...candidate, target_skill_id: 999 }, target(), official), null);
  assert.equal(normalizeAiLesson({
    ...candidate,
    micro_explanation: { ...candidate.micro_explanation, examples: candidate.micro_explanation.examples.slice(0, 9) },
  }, target(), official), null);
  assert.equal(normalizeAiLesson({
    ...candidate,
    micro_explanation: {
      ...candidate.micro_explanation,
      examples: candidate.micro_explanation.examples.map((example,index) => ({
        ...example,
        sentence: `Example ${index + 1} follows the rule.`,
      })),
    },
  }, target(), official), null);
});

test("AI lesson normalization rejects examples outside the exact do-to-does rule", () => {
  const doTarget = {
    ...target(),
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.do_to_does",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 1,
    rule_signature_reviewed: true,
  };
  const officialQuestions = Array.from({ length: LESSON_EXERCISE_COUNT }, (_, index) => question({
    id: index + 1,
    question_text: `She ___ task ${index + 1} every day.`,
    option_a: "do",
    option_b: "does",
    correct_option: "B",
  }));
  const official = fallbackLesson(doTarget,[],makeExercises(officialQuestions));
  const doApplications = ruleApplications("does");
  const examples = DO_LESSON_SENTENCES.map((sentence,index) => ({
    sentence,
    rule_application: doApplications[index],
  }));
  const candidate = generatedLessonCandidate({
    micro_explanation: {
      rule: "Present Simple bo'lishli gapda uchinchi shaxs birlik uchun do fe'li does shakliga o'zgaradi.",
      examples,
    },
  });

  assert.deepEqual(microExplanationRuleWarnings(
    candidate.micro_explanation.rule,doTarget,generatedRuleContract()
  ),[]);
  assert.deepEqual(microExplanationRuleWarnings(
    "Do does shakliga o'zgaradi.",doTarget,generatedRuleContract()
  ).sort(),[
    "CONTENT_RULE_POLARITY_MISSING",
    "CONTENT_RULE_SUBJECT_MISSING",
    "CONTENT_RULE_TENSE_MISSING",
  ]);
  assert.ok(microExplanationRuleWarnings(
    "Present Simple bo'lishli gapda uchinchi shaxs birlik uchun does ishlatiladi.",
    doTarget,generatedRuleContract()
  ).includes("CONTENT_RULE_TRANSFORMATION_MISSING"));
  assert.ok(normalizeAiLesson(candidate,doTarget,official));
  assert.equal(normalizeAiLesson({
    ...candidate,
    micro_explanation: { ...candidate.micro_explanation,rule: "Do does shakliga o'zgaradi." },
  },doTarget,official,generatedRuleContract()),null);
  const contaminated = {
    ...candidate,
    micro_explanation: {
      ...candidate.micro_explanation,
      examples: candidate.micro_explanation.examples.map((example,index) => index === 3
        ? { ...example,sentence: "It does not rain in summer." } : example),
    },
  };
  assert.equal(normalizeAiLesson(contaminated,doTarget,official),null);
  assert.ok(lessonContentWarnings(contaminated,official.guided_practice,doTarget)
    .includes("CONTENT_EXAMPLE_RULE_MISMATCH"));
  const wordingError = {
    ...candidate,
    micro_explanation: {
      ...candidate.micro_explanation,
      examples: candidate.micro_explanation.examples.map((example,index) => index === 2
        ? { ...example,rule_application: "Uchinchidan shaxs birlikda does ishlatiladi." } : example),
    },
  };
  assert.equal(normalizeAiLesson(wordingError,doTarget,official),null);
  assert.ok(lessonContentWarnings(wordingError,official.guided_practice,doTarget)
    .includes("CONTENT_UZBEK_WORDING_INVALID"));
  const missingTargetForm = {
    ...candidate,
    micro_explanation: {
      ...candidate.micro_explanation,
      examples: candidate.micro_explanation.examples.map((example,index) => index === 4
        ? { ...example,rule_application: "Bu gapda uchinchi shaxs birlik qoidasi qo'llangan." }
        : example),
    },
  };
  assert.equal(normalizeAiLesson(missingTargetForm,doTarget,official),null);
  assert.ok(lessonContentWarnings(missingTargetForm,official.guided_practice,doTarget)
    .includes("CONTENT_RULE_APPLICATION_TARGET_MISSING"));
  const duplicatedApplications = {
    ...candidate,
    micro_explanation: {
      ...candidate.micro_explanation,
      examples: candidate.micro_explanation.examples.map((example) => ({
        ...example,
        rule_application: "Does shakli bu uchinchi shaxs birlik gapida ishlatilgan.",
      })),
    },
  };
  assert.equal(normalizeAiLesson(duplicatedApplications,doTarget,official),null);
  assert.ok(lessonContentWarnings(duplicatedApplications,official.guided_practice,doTarget)
    .includes("CONTENT_RULE_APPLICATION_DUPLICATE"));
});

test("hybrid review corrects only a proven canonical-collocation false negative", () => {
  const doTarget = {
    ...target(),
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.do_to_does",
  };
  const lesson = generatedLessonCandidate({
    micro_explanation: {
      rule: "Present Simple bo'lishli gapda uchinchi shaxs birlik uchun do fe'li does shakliga o'zgaradi.",
      examples: DO_LESSON_SENTENCES.map((sentence,index) => ({
        sentence,
        rule_application: ruleApplications("does")[index],
      })),
    },
  });
  const falseNegative = approvedLessonReview({
    approved: false,
    confidence: 0.85,
    checks: { ...approvedLessonReview().checks,grammatical_accuracy: false,examples_match_rule: false },
    warnings: [{ code: "grammatical_error",message: "Some examples use non-allowed noun objects and collocations." }],
    retry_feedback: "Use only allowed noun objects.",
  });
  const reconciled = reconcileLessonReview(falseNegative,lesson,doTarget);
  assert.equal(reconciled.approved,true);
  assert.equal(reconciled.checks.grammatical_accuracy,true);
  assert.equal(reconciled.checks.examples_match_rule,true);
  assert.deepEqual(reconciled.warnings,[]);

  const realGrammarFailure = {
    ...falseNegative,
    warnings: [{ code: "grammatical_error",message: "The sentence has incorrect tense and word order." }],
  };
  assert.deepEqual(reconcileLessonReview(realGrammarFailure,lesson,doTarget),realGrammarFailure);
  assert.deepEqual(reconcileLessonReview(falseNegative,lesson,target()),falseNegative);
});

test("hybrid review never overrides a real grammar failure for other canonical rules", () => {
  const regularTarget = {
    ...target(),
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s",
  };
  const lesson = generatedLessonCandidate({
    micro_explanation: {
      rule: "Uchinchi shaxs birlikda regular fe'lga s qo'shiladi.",
      examples: Array.from({ length: 10 },() => ({
        sentence: "She plays tennis every day.",
        rule_application: "Play fe'liga s qo'shilgan.",
      })),
    },
  });
  const review = approvedLessonReview({
    approved: false,confidence: 0.85,
    checks: { ...approvedLessonReview().checks,grammatical_accuracy: false,examples_match_rule: false },
    warnings: [{ code: "examples_mismatch",message: "Examples do not follow required patterns." }],
    retry_feedback: "Correct the examples.",
  });
  assert.deepEqual(reconcileLessonReview(review,lesson,regularTarget),review);
});

test("all deterministic canonical rules pass the bounded on-demand lesson pipeline", async () => {
  for (const item of CANONICAL_PIPELINE_CASES) {
    const exactTarget = canonicalPipelineTarget(item);
    const questions = canonicalPipelineQuestions(item);
    const exercises = makeExercises(questions);
    const aiQuestions = questions.map((entry) => ({
      ...entry,options: {
        A: entry.option_a,B: entry.option_b,C: entry.option_c,D: entry.option_d,
      },
    }));
    assert.equal(aiQuestions.every((entry) => validCandidateForRule(entry,exactTarget)),true,item.signature);
    const fallback = fallbackLesson(exactTarget,[],exercises);
    let generated = 0;
    let reviewed = 0;
    const aiService = ruleContractAi({
      async generatePersonalizedRuleContract() {
        return { contract: canonicalPipelineContract(item) };
      },
      async generatePersonalizedLesson() {
        generated += 1;
        return { lesson: canonicalPipelineCandidate(item) };
      },
      async reviewPersonalizedLesson() {
        reviewed += 1;
        return { review: approvedLessonReview({
          approved: false,confidence: 0.86,
          checks: { ...approvedLessonReview().checks,examples_match_rule: false },
          warnings: [{ code: "examples_mismatch",message: "Examples do not follow required patterns." }],
          retry_feedback: "Use the required pattern.",
        }) };
      },
    });
    const result = await resolveGeneratedLesson({ aiService,target: exactTarget,fallback });
    const practice = [
      ...result.lesson.guided_practice,...result.lesson.independent_practice,
      ...result.lesson.error_correction,...result.lesson.transfer_practice,
      ...result.lesson.final_check,
    ];
    assert.equal(result.source,"ai",item.signature);
    assert.deepEqual(result.warnings,[],item.signature);
    assert.equal(result.lesson.micro_explanation.examples.length,10,item.signature);
    assert.equal(practice.length,10,item.signature);
    assert.deepEqual(lessonContentWarnings(result.lesson,exercises,exactTarget),[],item.signature);
    assert.equal(generated,1,item.signature);
    assert.equal(reviewed,1,item.signature);

    let contaminatedReviews = 0;
    const rejected = await resolveGeneratedLesson({
      aiService: ruleContractAi({
        async generatePersonalizedRuleContract() {
          return { contract: canonicalPipelineContract(item) };
        },
        async generatePersonalizedLesson() {
          return { lesson: canonicalPipelineCandidate(item,true) };
        },
        async reviewPersonalizedLesson() {
          contaminatedReviews += 1;
          return { review: approvedLessonReview() };
        },
      }),
      target: exactTarget,fallback,
    });
    assert.equal(rejected.source,"fallback",item.signature);
    assert.deepEqual(rejected.warnings,["AI_LESSON_REJECTED"],item.signature);
    assert.equal(contaminatedReviews,0,item.signature);

    let contractReviews = 0;
    let lessonGenerations = 0;
    const validContract = canonicalPipelineContract(item);
    const invalidContract = {
      ...validContract,
      source_construction: { ...validContract.source_construction,target_form: "wrong" },
    };
    const rejectedContract = await resolveGeneratedLesson({
      aiService: ruleContractAi({
        async generatePersonalizedRuleContract() { return { contract: invalidContract }; },
        async reviewPersonalizedRuleContract() {
          contractReviews += 1;
          return { review: approvedContractReview() };
        },
        async generatePersonalizedLesson() {
          lessonGenerations += 1;
          return { lesson: canonicalPipelineCandidate(item) };
        },
      }),
      target: exactTarget,fallback,
    });
    assert.equal(rejectedContract.source,"fallback",item.signature);
    assert.deepEqual(rejectedContract.warnings,["AI_RULE_CONTRACT_REJECTED"],item.signature);
    assert.equal(contractReviews,0,item.signature);
    assert.equal(lessonGenerations,0,item.signature);
  }
});

test("semantic reviewer approves a lesson before AI content is exposed", async () => {
  const fallback = fallbackLesson(target(),[],[]);
  const result = await resolveGeneratedLesson({
    aiService: ruleContractAi({
      async generatePersonalizedLesson() { return { lesson: generatedLessonCandidate() }; },
      async reviewPersonalizedLesson() { return { review: approvedLessonReview() }; },
    }),
    target: target(),fallback,
  });

  assert.equal(result.source,"ai");
  assert.deepEqual(result.warnings,[]);
  assert.deepEqual(result.lesson.micro_explanation.examples,
    generatedLessonCandidate().micro_explanation.examples);
  assert.deepEqual(result.lesson.rule_contract,generatedRuleContract());
});

test("semantic reviewer feedback is applied to one bounded retry", async () => {
  const payloads = [];
  let reviews = 0;
  const result = await resolveGeneratedLesson({
    aiService: ruleContractAi({
      async generatePersonalizedLesson(payload) {
        payloads.push(payload);
        return { lesson: generatedLessonCandidate() };
      },
      async reviewPersonalizedLesson() {
        reviews += 1;
        return { review: reviews === 1 ? approvedLessonReview({
          approved: false,confidence: 0.88,
          checks: { ...approvedLessonReview().checks,exact_rule_scope: false },
          warnings: [{ code: "ADJACENT_RULE",message: "Qo'shni mavzu aralashgan." }],
          retry_feedback: "Faqat uchinchi shaxs birlik qoidasini tushuntiring.",
        }) : approvedLessonReview() };
      },
    }),
    target: target(),fallback: fallbackLesson(target(),[],[]),
  });

  assert.equal(result.source,"ai");
  assert.equal(payloads.length,2);
  assert.equal(reviews,2);
  assert.match(payloads[1].review_feedback,/Faqat uchinchi shaxs/);
});

test("two semantic review failures keep the lesson in review-required flow", async () => {
  let generated = 0;
  const rejected = approvedLessonReview({
    approved: false,confidence: 0.81,
    checks: { ...approvedLessonReview().checks,uzbek_explanations: false },
    warnings: [{ code: "LANGUAGE_MISMATCH",message: "Izohlar o'zbek tilida emas." }],
    retry_feedback: "Barcha izohlarni o'zbek tilida yozing.",
  });
  const result = await resolveGeneratedLesson({
    aiService: ruleContractAi({
      async generatePersonalizedLesson() { generated += 1; return { lesson: generatedLessonCandidate() }; },
      async reviewPersonalizedLesson() { return { review: rejected }; },
    }),
    target: target(),fallback: fallbackLesson(target(),[],[]),
  });

  assert.equal(generated,2);
  assert.equal(result.source,"fallback");
  assert.deepEqual(result.warnings,["AI_LESSON_SEMANTIC_REVIEW_FAILED"]);
});

test("missing semantic reviewer never publishes generated lesson content", async () => {
  const result = await resolveGeneratedLesson({
    aiService: ruleContractAi({
      async generatePersonalizedLesson() { return { lesson: generatedLessonCandidate() }; },
    }),
    target: target(),fallback: fallbackLesson(target(),[],[]),
  });
  assert.equal(result.source,"fallback");
  assert.deepEqual(result.warnings,["AI_LESSON_REVIEW_UNAVAILABLE"]);
});

test("review contract rejects contradictory verdict fields", () => {
  const valid = {
    schema_version: "personalized_lesson_review_v1",
    ...approvedLessonReview(),
  };
  assert.equal(validatePersonalizedLessonReview(valid),true);
  assert.equal(validatePersonalizedLessonReview({ ...valid,approved: false,confidence: 0 }),false);
  assert.equal(validatePersonalizedLessonReview({
    ...valid,approved: false,confidence: 0.92,
    checks: { ...valid.checks,examples_match_rule: false },
    warnings: [{ code: "EXAMPLE_MISMATCH",message: "Misol qoida doirasidan chiqdi." }],
    retry_feedback: "Misollarni aniq qoidaga moslang.",
  }),true);
});

test("structured rule contract validators reject broad or contradictory contracts", () => {
  const contract = generatedRuleContract();
  assert.equal(validatePersonalizedRuleContract(contract,contract.canonical_rule_signature),true);
  assert.equal(validatePersonalizedRuleContract({ ...contract,forbidden_patterns: [] },
    contract.canonical_rule_signature),false);
  assert.equal(validatePersonalizedRuleContract(contract,"another.signature"),false);
  const review = approvedContractReview();
  assert.equal(validatePersonalizedRuleContractReview(review),true);
  assert.equal(normalizePersonalizedRuleContractReview(review).approved,true);
  assert.equal(validatePersonalizedRuleContractReview({
    ...review,findings: [{ check: "constraints_actionable",code: "CONTRADICTION",
      message: "Finding bilan check true." }],
  }),false);
});

test("rule contract generation receives CEFR without relying on learner metrics", async () => {
  let contractPayload;
  await resolveGeneratedLesson({
    aiService: ruleContractAi({
      async generatePersonalizedRuleContract(payload) {
        contractPayload = payload;
        return { contract: generatedRuleContract() };
      },
      async generatePersonalizedLesson() { return { lesson: generatedLessonCandidate() }; },
      async reviewPersonalizedLesson() { return { review: approvedLessonReview() }; },
    }),
    target: target(),fallback: fallbackLesson(target(),[],[]),
  });
  assert.equal(contractPayload.cefr_level,"A1");
});

test("server source alignment overrides reviewer hallucination but blocks answer mismatch", () => {
  const contract = generatedRuleContract();
  const snapshot = {
    canonical_rule_signature: contract.canonical_rule_signature,
    source_error: { selected_answer: "do",correct_answer: "does" },
    proposed_contract: contract,
  };
  assert.equal(validatePersonalizedRuleContractSourceAlignment(snapshot),true);
  const falseNegative = approvedContractReview({
    approved: false,
    checks: { ...approvedContractReview().checks,exact_source_alignment: false },
    findings: [{ check: "exact_source_alignment",code: "MODEL_MISMATCH",
      message: "Reviewer base va target shakllarini adashtirdi." }],
    warnings: [{ code: "MODEL_MISMATCH",message: "Reviewer base va target shakllarini adashtirdi." }],
  });
  assert.equal(normalizePersonalizedRuleContractReview(falseNegative,snapshot).approved,true);
  const mismatched = { ...snapshot,source_error: { selected_answer: "have",correct_answer: "does" } };
  assert.equal(validatePersonalizedRuleContractSourceAlignment(mismatched),false);
  assert.equal(normalizePersonalizedRuleContractReview(approvedContractReview(),mismatched).approved,false);
});

test("rejected rule contract prevents lesson generation", async () => {
  let lessonGenerated = false;
  const rejected = approvedContractReview({
    approved: false,confidence: 0.93,
    checks: { ...approvedContractReview().checks,adjacent_rules_excluded: false },
    findings: [{ check: "adjacent_rules_excluded",code: "ADJACENT_RULE",
      message: "Qo'shni qoida chiqarib tashlanmagan." }],
    warnings: [{ code: "ADJACENT_RULE",message: "Qo'shni qoida chiqarib tashlanmagan." }],
    retry_feedback: "Qo'shni qoidani taqiqlang.",
  });
  const result = await resolveGeneratedLesson({
    aiService: ruleContractAi({
      async reviewPersonalizedRuleContract() { return { review: rejected }; },
      async generatePersonalizedLesson() { lessonGenerated = true; return { lesson: generatedLessonCandidate() }; },
    }),
    target: target(),fallback: fallbackLesson(target(),[],[]),
  });
  assert.equal(lessonGenerated,false);
  assert.equal(result.source,"fallback");
  assert.deepEqual(result.warnings,["AI_RULE_CONTRACT_REJECTED"]);
});

test("lesson generation reuses exact canonical teaching constraints", () => {
  const constraints = canonicalRuleTeachingConstraints({
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.do_to_does",
  });
  assert.match(constraints.join(" "),/lexical main verb/);
  assert.match(constraints.join(" "),/Never use does not/);
  assert.match(canonicalRuleTeachingConstraints({
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies",
  }).join(" "),/consonant \+ y/);
});

test("shared lesson content never replaces the current learner's exact error", () => {
  const current = fallbackLesson(target(), [{
    answer_event_id: 501, question_text: "Those children ___ playing.",
    selected_answer: "have", correct_answer: "are", explanation: "Use are before verb-ing.",
  }], makeExercises(Array.from({ length: 10 }, (_, index) => question({
    id: index + 1,
    question_text: `Learner ${CANONICAL_PIPELINE_LABELS[index]} ___ English every day.`,
    explanation: ruleApplications("studies")[index],
  }))));
  const shared = {
    ...current,
    source_error: { answer_event_id: 999, selected_answer: "is" },
    diagnostic_summary: { student_message: "another learner", teacher_message: "another learner" },
    student_error_examples: [{ selected_answer: "is" }],
    worked_examples: [{ incorrect: "is" }],
  };

  const personalized = personalizeSharedLesson(shared, target(), current);

  assert.equal(personalized.source_error.answer_event_id, 501);
  assert.equal(personalized.source_error.selected_answer, "have");
  assert.equal(personalized.diagnostic_summary.student_message, current.diagnostic_summary.student_message);
  assert.deepEqual(personalized.student_error_examples, current.student_error_examples);
  assert.deepEqual(personalized.worked_examples, current.worked_examples);
});

test("shared canonical lesson preserves only a validated matching rule contract", () => {
  const reviewedTarget = {
    ...target(),
    rule_signature: generatedRuleContract().canonical_rule_signature,
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 0.98,
    rule_signature_reviewed: true,
  };
  const exercises = makeExercises(Array.from({ length: 10 }, (_, index) => question({ id: index + 1 })));
  const current = fallbackLesson(reviewedTarget,[{
    question_text: "She ___ her homework.",selected_answer: "do",correct_answer: "does",
    explanation: "She bilan do fe'li does bo'ladi.",
  }],exercises);
  const contract = generatedRuleContract();
  const shared = {
    ...current,
    micro_explanation: {
      ...current.micro_explanation,
      rule: "Present Simple bo'lishli gapda uchinchi shaxs birlik uchun do fe'li does shakliga o'zgaradi.",
      examples: DO_LESSON_SENTENCES.map((sentence,index) => ({
        sentence,
        rule_application: ruleApplications("does")[index],
      })),
    },
    rule_contract: contract,
  };

  const personalized = personalizeSharedLesson(shared,reviewedTarget,current,
    validatePersonalizedRuleContract);
  assert.deepEqual(personalized.rule_contract,contract);
  assert.equal(personalizeSharedLesson({ ...shared,rule_contract: { ...contract,
    canonical_rule_signature: "another.rule" } },reviewedTarget,current,
  validatePersonalizedRuleContract),null);
});

test("Grammar in Use methodology profile follows CEFR bands without reproducing book content", () => {
  assert.equal(grammarInUseProfile("A1").reference_level,"Essential Grammar in Use");
  assert.equal(grammarInUseProfile("B2").reference_level,"English Grammar in Use");
  assert.equal(grammarInUseProfile("C1").reference_level,"Advanced Grammar in Use");
});

test("personalized lesson provider contract matches the active lesson content version", () => {
  assert.equal(require("../src/services/personalizedLessonService").LESSON_PROMPT_VERSION,
    "personalized_lesson_prompt_v12");
  const source = fs.readFileSync(path.join(__dirname,"../aiService.js"),"utf8");
  const generator = source.slice(
    source.indexOf("const PERSONALIZED_LESSON_SCHEMA_VERSION"),
    source.indexOf("const REMEDIATION_EXERCISE_SCHEMA_VERSION")
  );
  assert.match(generator,/PERSONALIZED_LESSON_SCHEMA_VERSION = "personalized_lesson_v3"/);
  assert.match(generator,/"schema_version":"\$\{PERSONALIZED_LESSON_SCHEMA_VERSION\}"/);
  assert.match(generator,/PERSONALIZED_LESSON_PROMPT_VERSION = "personalized_lesson_prompt_v12"/);
  assert.match(generator,/PERSONALIZED_RULE_CONTRACT_SCHEMA_VERSION = "personalized_rule_contract_v1"/);
  assert.match(generator,/PERSONALIZED_RULE_CONTRACT_PROMPT_VERSION = "personalized_rule_contract_prompt_v3"/);
  assert.match(generator,/previous contract failed the required schema/);
  assert.match(generator,/PERSONALIZED_RULE_CONTRACT_REVIEW_SCHEMA_VERSION = "personalized_rule_contract_review_v2"/);
  assert.match(generator,/PERSONALIZED_RULE_CONTRACT_REVIEW_PROMPT_VERSION = "personalized_rule_contract_review_prompt_v6"/);
  assert.match(generator,/Compare construction labels by grammatical meaning, not exact wording/);
  assert.match(generator,/For exact_source_alignment, inspect only proposed_contract\.source_construction/);
  assert.match(generator,/for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(generator,/forbidden_patterns is a deny-list/);
  assert.match(generator,/lexical or auxiliary/);
  assert.match(generator,/Do not introduce negatives, questions, emphatic auxiliaries/);
  assert.match(generator,/PERSONALIZED_LESSON_REVIEW_SCHEMA_VERSION = "personalized_lesson_review_v1"/);
  assert.match(generator,/PERSONALIZED_LESSON_REVIEW_PROMPT_VERSION = "personalized_lesson_review_prompt_v3"/);
  assert.match(generator,/promptVersion: PERSONALIZED_LESSON_REVIEW_PROMPT_VERSION/);
  assert.match(generator,/schemaVersion: PERSONALIZED_LESSON_REVIEW_SCHEMA_VERSION/);
  assert.doesNotMatch(generator,/personalized_lesson_(?:prompt_)?v2/);
});

test("per-error remediation migration preserves legacy plans and uniquely keys new answer errors", () => {
  const sql = fs.readFileSync(path.join(__dirname,"../migrations/047_per_error_remediation_lessons.sql"),"utf8");
  assert.match(sql,/ADD COLUMN IF NOT EXISTS source_answer_event_id BIGINT/);
  assert.match(sql,/source_answer_event_id IS NULL AND status NOT IN \('STABLE','MASTERED'\)/);
  assert.match(sql,/ON remediation_plans\(student_id,source_answer_event_id\)/);
  assert.match(sql,/source_answer_event_id IS NOT NULL AND status NOT IN \('STABLE','MASTERED'\)/);
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

test("lesson completion requires 80 percent mastery without advancing remediation", async () => {
  assert.equal(lessonMasteryRequiredCorrect(10),8);
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (String(sql).includes("SELECT l.remediation_plan_id")) {
        return { rows: [{ remediation_plan_id: 91,taxonomy_id: 7,status: "STARTED",total: "10",answered: "10",correct: "7" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = createPersonalizedLessonService({
    pool: { async connect() { return client; } },
    aiService: null,
    logger: { error() {} },
  });

  const result = await service.completeLesson(4,12);

  assert.deepEqual(result, {
    mastery_not_met: true,answered: 10,total: 10,correct: 7,required_correct: 8,
  });
  assert.equal(queries.filter((sql) => sql === "ROLLBACK").length,1);
  assert.equal(queries.some((sql) => String(sql).includes("status='COMPLETED'")),false);
  assert.equal(queries.some((sql) => String(sql).includes("LESSON_COMPLETED")),false);
  assert.equal(queries.some((sql) => String(sql).includes("RETEST_PENDING")),false);
});

test("successful lesson completion commits every state transition with valid SQL bindings", async () => {
  const calls = [];
  function assertBindings(sql,values = []) {
    const placeholders = Array.from(String(sql).matchAll(/\$(\d+)/g),match => Number(match[1]));
    const expected = placeholders.length ? Math.max(...placeholders) : 0;
    assert.equal(values.length,expected,`SQL binding mismatch: ${String(sql).replace(/\s+/g," ").trim()}`);
  }
  const client = {
    async query(sql,values = []) {
      assertBindings(sql,values);
      calls.push({ sql:String(sql),values });
      if (String(sql).includes("SELECT l.remediation_plan_id")) {
        return { rows: [{ remediation_plan_id: 91,taxonomy_id: 7,status: "STARTED",total: "10",answered: "10",correct: "8" }] };
      }
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE",values: [] }); },
  };
  const pool = {
    async connect() { return client; },
    async query(sql,values = []) {
      assertBindings(sql,values);
      if (String(sql).includes("SELECT l.*")) {
        return { rows: [{ id: 12,remediation_plan_id: 91,status: "COMPLETED",progress_percent: 100 }] };
      }
      if (String(sql).includes("FROM personalized_lesson_exercises e")) return { rows: [] };
      return { rows: [] };
    },
  };
  const service = createPersonalizedLessonService({ pool,aiService: null,logger: { error() {} } });

  const result = await service.completeLesson(4,12);

  assert.equal(result.status,"COMPLETED");
  assert.equal(result.progress_percent,100);
  const transactionSql = calls.map(({ sql }) => sql);
  assert.equal(transactionSql[0],"BEGIN");
  assert.ok(transactionSql.some(sql => sql.includes("status='COMPLETED'")));
  assert.ok(transactionSql.some(sql => sql.includes("status='RETEST_PENDING'")));
  assert.ok(transactionSql.some(sql => sql.includes("current_evidence_state='REMEDIATING'")));
  assert.ok(transactionSql.some(sql => sql.includes("'LESSON_COMPLETED'")));
  const staleReport = calls.find(({ sql }) => sql.includes("UPDATE ai_reports"));
  assert.deepEqual(staleReport.values,[4]);
  assert.equal(transactionSql.at(-2),"COMMIT");
  assert.equal(transactionSql.at(-1),"RELEASE");
  assert.equal(transactionSql.includes("ROLLBACK"),false);
});

test("controller returns retry guidance and does not schedule a retest below mastery", async () => {
  let retestCalls = 0;
  const controller = createStudentRemediationController({
    lessonService: {
      async completeLesson() {
        return { mastery_not_met: true,answered: 10,total: 10,correct: 7,required_correct: 8 };
      },
    },
    reviewService: { async ensureInitialRetest() { retestCalls += 1; } },
    logger: { error() {} },
  });
  const response = responseHarness();

  await controller.complete({ user: { id: 4 },params: { lessonId: "12" } },response);

  assert.equal(response.statusCode,409);
  assert.deepEqual(response.body, {
    error: "Darsni yakunlash uchun kamida 8/10 ta to'g'ri javob kerak. Xato javoblarni qayta ko'rib chiqing.",
    answered: 10,total: 10,correct: 7,required_correct: 8,
  });
  assert.equal(retestCalls,0);
});

test("controller schedules the first independent retest after successful lesson completion", async () => {
  const scheduled = [];
  const lesson = { id: 12,status: "COMPLETED",remediation_plan_id: 91,progress_percent: 100 };
  const controller = createStudentRemediationController({
    lessonService: { async completeLesson() { return lesson; } },
    reviewService: {
      async ensureInitialRetest(studentId,planId) { scheduled.push([studentId,planId]); },
    },
    logger: { error() {} },
  });
  const response = responseHarness();

  await controller.complete({ user: { id: 4 },params: { lessonId: "12" } },response);

  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body,{ lesson });
  assert.deepEqual(scheduled,[[4,91]]);
});

test("retest scheduling failure preserves the committed completed lesson response", async () => {
  const errors = [];
  const metrics = [];
  const lesson = { id: 12,status: "COMPLETED",remediation_plan_id: 91,progress_percent: 100 };
  const controller = createStudentRemediationController({
    lessonService: { async completeLesson() { return lesson; } },
    reviewService: {
      async ensureInitialRetest() { throw new Error("temporary database disconnect"); },
    },
    logger: { error(...args) { errors.push(args); } },
    observability: { increment(metric) { metrics.push(metric); } },
  });
  const response = responseHarness();

  await controller.complete({ user: { id: 4 },params: { lessonId: "12" } },response);

  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body,{ lesson });
  assert.equal(errors.length,1);
  assert.equal(errors[0][0],"Retest yaratish xatosi:");
  assert.equal(errors[0][1],"temporary database disconnect");
  assert.deepEqual(metrics,["learning_retest_schedule_failures_total"]);
});

test("controller requires one exact answer event during on-demand lesson sync", async () => {
  const calls = [];
  const controller = createStudentRemediationController({
    lessonService: {
      async syncLessons(studentId, taxonomyId, answerEventId) {
        calls.push([studentId, taxonomyId, answerEventId]);
        return { created_count: 1, target_count: 1 };
      },
    },
    logger: { error() {} },
  });

  const targeted = responseHarness();
  await controller.sync({ user: { id: 4 }, body: { taxonomy_id: "23", answer_event_id: "951" } }, targeted);
  assert.equal(targeted.statusCode, 200);
  assert.deepEqual(calls, [[4, 23, 951]]);

  const invalid = responseHarness();
  await controller.sync({ user: { id: 4 }, body: { taxonomy_id: "bad" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls.length, 1);

  const invalidEvent = responseHarness();
  await controller.sync({ user: { id: 4 }, body: { taxonomy_id: "23", answer_event_id: "bad" } }, invalidEvent);
  assert.equal(invalidEvent.statusCode, 400);
  assert.equal(calls.length, 1);

  const missingEvent = responseHarness();
  await controller.sync({ user: { id: 4 }, body: { taxonomy_id: "23" } }, missingEvent);
  assert.equal(missingEvent.statusCode, 400);
  assert.deepEqual(missingEvent.body, {
    error: "Dars yaratish uchun aniq xato dalili talab qilinadi.",
  });
  assert.equal(calls.length, 1);

  const answerOnly = responseHarness();
  await controller.sync({ user: { id: 4 }, body: { answer_event_id: "952" } }, answerOnly);
  assert.equal(answerOnly.statusCode, 200);
  assert.deepEqual(calls[1], [4, null, 952]);
});

test("progress lesson dialog renders the exact source error safely", () => {
  const html = fs.readFileSync(path.join(__dirname,"../public/progress.html"),"utf8");
  const script = fs.readFileSync(path.join(__dirname,"../public/progress.js"),"utf8");
  assert.match(html,/id="lessonDialogSourceError"/);
  assert.match(html,/id="lessonDialogSelectedAnswer"/);
  assert.match(html,/id="lessonDialogCorrectAnswer"/);
  assert.match(script,/const sourceError = content\.source_error \|\| \{\}/);
  assert.match(script,/lessonDialogSelectedAnswer/);
});
