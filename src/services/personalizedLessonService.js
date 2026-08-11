const crypto = require("crypto");
const { approvedLessonTemplate } = require("./approvedLessonTemplateService");
const {
  learningTextContainsPhrase,
  learningTextDuplicateIndexes,
  normalizedLearningText,
} = require("../utils/learningContentSimilarity");
const {
  createAiRemediationExerciseService,
  hasValidQuestionPrompt,
  canonicalRuleTeachingConstraints,
  lessonExampleMatchesCanonicalRule,
  lessonExampleTargetForm,
  deterministicLessonExampleReview,
  deterministicRuleContractReview,
  canonicalizeRuleContract,
} = require("./aiRemediationExerciseService");
const {
  canonicalRuleScope,
  createRemediationContentCacheService,
} = require("./remediationContentCacheService");

const LESSON_SCHEMA_VERSION = "personalized_lesson_v3";
const LESSON_PROMPT_VERSION = "personalized_lesson_prompt_v12";
const LESSON_EXERCISE_COUNT = 10;
const LESSON_MASTERY_RATIO = 0.8;
const VALID_OPTIONS = new Set(["A", "B", "C", "D"]);
const BLOCKING_QUALITY_WARNINGS = new Set([
  "AI_LESSON_REJECTED", "AI_LESSON_SEMANTIC_REVIEW_FAILED", "AI_LESSON_REVIEW_UNAVAILABLE",
  "AI_RULE_CONTRACT_GENERATION_FAILED", "AI_RULE_CONTRACT_REVIEW_UNAVAILABLE",
  "AI_RULE_CONTRACT_REJECTED",
]);
const LEVEL_ORDER = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"];

function lessonMasteryRequiredCorrect(total) {
  const questionCount = Math.max(0,Number(total) || 0);
  return Math.ceil(questionCount * LESSON_MASTERY_RATIO);
}

function text(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hashContent(content) {
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function safeOptions(question) {
  return {
    A: text(question.option_a, 1000), B: text(question.option_b, 1000),
    C: text(question.option_c, 1000), D: text(question.option_d, 1000),
  };
}

function isApprovedExercise(question, originalTexts, studentLevel) {
  const options = safeOptions(question);
  const values = Object.values(options);
  const questionLevel = LEVEL_ORDER.indexOf(question.cefr_level);
  const learnerLevel = LEVEL_ORDER.indexOf(studentLevel);
  return Boolean(question.diagnostic_eligible)
    && hasValidQuestionPrompt(question.question_text,question.question_type || "multiple_choice")
    && !originalTexts.has(text(question.question_text).toLowerCase())
    && VALID_OPTIONS.has(text(question.correct_option, 1).toUpperCase())
    && values.every(Boolean)
    && new Set(values.map((value) => value.toLowerCase())).size === values.length
    && text(question.explanation).length >= 4
    && (questionLevel < 0 || learnerLevel < 0 || questionLevel <= learnerLevel);
}

function lessonRuleApplicationWarnings(examples,target) {
  if (!Array.isArray(examples)) return [];
  const warnings = [];
  if (learningTextDuplicateIndexes(examples.map((example) => (
    example && example.rule_application
  ))).length > 0) warnings.push("CONTENT_RULE_APPLICATION_DUPLICATE");
  if (examples.some((example) => {
    const targetForm = lessonExampleTargetForm(example && example.sentence,target);
    return targetForm && !learningTextContainsPhrase(example && example.rule_application,targetForm);
  })) warnings.push("CONTENT_RULE_APPLICATION_TARGET_MISSING");
  return warnings;
}

function ruleHasAnyPhrase(rule,phrases) {
  return phrases.some((phrase) => learningTextContainsPhrase(rule,phrase));
}

function microExplanationRuleWarnings(rule,target,ruleContract = null) {
  const signature = text(target && target.rule_signature,255);
  const source = ruleContract && ruleContract.source_construction;
  if (!signature && !source) return [];
  const warnings = [];
  const normalizedRule = normalizedLearningText(rule);
  const presentSimple = signature.includes("present_simple") || source?.tense === "present simple";
  const pastSimple = signature.includes("past_simple") || source?.tense === "past simple";
  if (presentSimple && !ruleHasAnyPhrase(normalizedRule,["present simple","hozirgi oddiy"])) {
    warnings.push("CONTENT_RULE_TENSE_MISSING");
  }
  if (pastSimple && !ruleHasAnyPhrase(normalizedRule,["past simple","o'tgan oddiy"])) {
    warnings.push("CONTENT_RULE_TENSE_MISSING");
  }
  const affirmative = signature.includes("affirmative") || source?.polarity === "affirmative";
  if (affirmative && !ruleHasAnyPhrase(normalizedRule,["affirmative","bo'lishli"])) {
    warnings.push("CONTENT_RULE_POLARITY_MISSING");
  }
  const subjectConstraint = normalizedLearningText(source?.subject_constraint);
  if ((signature.includes("first_person_singular") || subjectConstraint.includes("first person singular"))
      && !ruleHasAnyPhrase(normalizedRule,["first person singular","birinchi shaxs birlik"])) {
    warnings.push("CONTENT_RULE_SUBJECT_MISSING");
  }
  if ((signature.includes("third_person_singular") || subjectConstraint.includes("third person singular"))
      && !ruleHasAnyPhrase(normalizedRule,["third person singular","uchinchi shaxs birlik","he she it"])) {
    warnings.push("CONTENT_RULE_SUBJECT_MISSING");
  }
  const requiredForms = [source?.base_form,source?.target_form].filter(Boolean);
  const signatureForms = signature.includes("do_to_does") ? ["do","does"]
    : signature.includes("first_person_singular_i_am") ? ["be","am"]
      : signature.includes("consonant_y_to_ies") ? ["y","ies"]
        : signature.includes("vowel_y_add_s") ? ["y","s"]
          : signature.includes("verb_ending_o_add_es") ? ["o","es"]
            : signature.includes("verb_ending_ch_add_es") ? ["ch","es"]
              : signature.includes("verb_ending_sh_add_es") ? ["sh","es"]
                : signature.includes("regular_verb_add_s") ? ["s"]
                  : signature.includes("regular_verb_ed") ? ["ed"] : [];
  const transformationForms = requiredForms.length ? requiredForms : signatureForms;
  if ([...new Set(transformationForms)]
    .some((form) => !learningTextContainsPhrase(normalizedRule,form))) {
    warnings.push("CONTENT_RULE_TRANSFORMATION_MISSING");
  }
  return warnings;
}

function lessonContentWarnings(lesson, exercises, target) {
  const warnings = [];
  const examples = lesson && lesson.micro_explanation && lesson.micro_explanation.examples;
  if (!lesson || Number(lesson.target_skill_id) !== Number(target && target.taxonomy_id)) {
    warnings.push("CONTENT_TARGET_MISMATCH");
  }
  if (!Array.isArray(examples) || examples.length !== LESSON_EXERCISE_COUNT) {
    warnings.push("CONTENT_EXAMPLE_COUNT_INVALID");
  } else if (examples.some((example) => (
    !example || !validString(example.sentence,1000) || example.sentence.includes("_")
      || !validString(example.rule_application,2000)
  ))) {
    warnings.push("CONTENT_EXAMPLE_FORMAT_INVALID");
  }
  if (Array.isArray(examples)
      && examples.some((example) => !lessonExampleMatchesCanonicalRule(example && example.sentence,target))) {
    warnings.push("CONTENT_EXAMPLE_RULE_MISMATCH");
  }
  if (Array.isArray(examples) && learningTextDuplicateIndexes(
    examples.map((example) => example && example.sentence)
  ).length > 0) warnings.push("CONTENT_EXAMPLE_DUPLICATE");
  if (Array.isArray(examples) && examples.some((example) => (
    /\buchinchidan\s+shaxs\b/i.test(text(example && example.rule_application,2000))
  ))) warnings.push("CONTENT_UZBEK_WORDING_INVALID");
  warnings.push(...lessonRuleApplicationWarnings(examples,target));
  if (lesson && lesson.rule_contract) {
    warnings.push(...microExplanationRuleWarnings(
      lesson.micro_explanation && lesson.micro_explanation.rule,target,lesson.rule_contract
    ));
  }
  if (!Array.isArray(exercises) || exercises.length !== LESSON_EXERCISE_COUNT) {
    warnings.push("CONTENT_EXERCISE_COUNT_INVALID");
  } else {
    const prompts = exercises.map((exercise) => text(exercise && exercise.prompt).toLowerCase());
    if (learningTextDuplicateIndexes(prompts).length > 0) warnings.push("CONTENT_EXERCISE_DUPLICATE");
    if (exercises.some((exercise) => {
      const options = exercise && exercise.options;
      const correct = text(exercise && exercise.correct_option,1).toUpperCase();
      return !hasValidQuestionPrompt(exercise && exercise.prompt,exercise && exercise.question_format)
        || !VALID_OPTIONS.has(correct) || !options || !validString(options[correct],1000)
        || Object.values(options).some((value) => !validString(value,1000) || value.includes("_"))
        || !validString(exercise && exercise.explanation,4000);
    })) warnings.push("CONTENT_EXERCISE_FORMAT_INVALID");
  }
  return [...new Set(warnings)];
}

function selectApprovedExercises(questions, originalTexts, studentLevel) {
  const fresh = questions.filter((item) => isApprovedExercise(item, originalTexts, studentLevel));
  const selectedIds = new Set(fresh.map((item) => Number(item.id)));
  const repeated = questions.filter((item) => (
    !selectedIds.has(Number(item.id)) && isApprovedExercise(item, new Set(), studentLevel)
  ));
  return [...fresh, ...repeated];
}

function exactQuestionBankScope(target) {
  if (!target || target.node_type !== "micro_skill") return null;
  const scope = canonicalRuleScope(target);
  return scope && scope.type === "rule" ? scope : null;
}

function canReuseQuestionBank(target) {
  return Boolean(exactQuestionBankScope(target));
}

function remediationEvidenceSnapshot(target) {
  const ruleScope = canonicalRuleScope(target);
  return {
    finding_code: target.finding_code,
    evidence_state: target.evidence_state,
    confidence: target.confidence,
    evidence: target.evidence,
    cefr_level: target.cefr_level,
    source_answer_event_id: target.source_answer_event_id || null,
    rule_signature: ruleScope && ruleScope.type === "rule" ? ruleScope.key : null,
    rule_signature_version: ruleScope && ruleScope.type === "rule" ? ruleScope.version : null,
  };
}

function summarizeLessonGeneration(targetCount, results) {
  const generated = (results || []).filter((result) => result && !result.generation_pending);
  return {
    created_count: generated.length,
    ready_count: generated.filter((lesson) => lesson.quality_status === "APPROVED").length,
    review_required_count: generated.filter((lesson) => lesson.quality_status !== "APPROVED").length,
    pending_count: (results || []).filter((result) => result && result.generation_pending).length,
    target_count: Number(targetCount) || 0,
  };
}

function sectionFor(index, total) {
  if (index < 2) return "guided_practice";
  if (index < Math.min(4, total)) return "independent_practice";
  if (index === total - 1) return "final_check";
  return index % 2 ? "error_correction" : "transfer_practice";
}

function makeExercises(questions) {
  return questions.slice(0, LESSON_EXERCISE_COUNT).map((question, index, list) => ({
    source_question_id: Number(question.id),
    section: sectionFor(index, list.length),
    position: index + 1,
    question_format: text(question.question_type, 80) || "multiple_choice",
    prompt: text(question.question_text), options: safeOptions(question),
    correct_option: text(question.correct_option, 1).toUpperCase(),
    explanation: text(question.explanation),
  }));
}

function lessonExamples(exercises, rule) {
  return exercises.slice(0, LESSON_EXERCISE_COUNT).map((exercise) => {
    const answer = exercise.options[exercise.correct_option] || exercise.correct_option;
    const prompt = text(exercise.prompt);
    return {
      sentence: prompt.includes("___") ? prompt.replace("___", answer) : `${prompt} — ${answer}`,
      rule_application: text(exercise.explanation) || rule,
    };
  });
}

function exerciseSummary(exercises, section) {
  return exercises.filter((item) => item.section === section).map((item) => ({
    source_question_id: item.source_question_id,
    format: item.question_format,
    instruction: section === "guided_practice"
      ? "Variantlarni qoida bilan solishtirib javob bering."
      : "Javobni mustaqil tanlang va sababini tushuntiring.",
  }));
}

function grammarInUseProfile(cefrLevel) {
  if (["Pre-A1", "A1", "A2"].includes(cefrLevel)) {
    return { level_band: "A1-B1", reference_level: "Essential Grammar in Use",
      method: "simple_reference_then_practice" };
  }
  if (["B1", "B2"].includes(cefrLevel)) {
    return { level_band: "B1-B2", reference_level: "English Grammar in Use",
      method: "intermediate_reference_then_practice" };
  }
  return { level_band: "C1-C2", reference_level: "Advanced Grammar in Use",
    method: "advanced_reference_then_practice" };
}

function fallbackLesson(target, errors, exercises) {
  const first = errors[0] || {};
  const evidence = target.evidence || {};
  const template = approvedLessonTemplate({
    legacySkill: target.legacy_skill,
    errorExplanation: first.explanation,
    taxonomyDescription: target.taxonomy_description,
  });
  const approvedRules = [target.taxonomy_description, ...errors.map((item) => item.explanation)]
    .map((item) => text(item)).filter(Boolean);
  const rule = [...new Set(approvedRules)].join("\n\n") || template.rule;
  const errorExamples = errors.slice(0, 4).map((item) => ({
    prompt: text(item.question_text), selected_answer: text(item.selected_answer),
    correct_answer: text(item.correct_answer), explanation: text(item.explanation) || rule,
  }));
  const worked = errorExamples.map((item) => ({
    prompt: item.prompt, incorrect: item.selected_answer, correct: item.correct_answer,
    reasoning: item.explanation,
  }));
  return {
    schema_version: LESSON_SCHEMA_VERSION,
    lesson_title: `${target.skill_name} — xato tahlili`,
    target_skill_id: Number(target.taxonomy_id),
    source_error: {
      answer_event_id: Number(first.answer_event_id || target.source_answer_event_id) || null,
      question: text(first.question_text), selected_answer: text(first.selected_answer),
      correct_answer: text(first.correct_answer), explanation: text(first.explanation) || rule,
    },
    pedagogical_profile: {
      ...grammarInUseProfile(target.cefr_level),
      structure: ["exact_error", "complete_rule", "ten_original_examples", "ten_reviewed_exercises"],
      content_policy: "original_content_no_book_text_reproduced",
    },
    fallback_template: {
      version: template.version,
      key: template.key,
      category: template.category,
      rule_source: template.rule_source,
    },
    diagnostic_summary: {
      student_message: first.question_text
        ? `Siz “${text(first.question_text,300)}” savolida “${text(first.selected_answer,120)}” javobini tanladingiz. To'g'ri javob: “${text(first.correct_answer,120)}”. Dars aynan shu xatoni tuzatadi.`
        : `${target.skill_name} bo'yicha aniqlangan xato uchun alohida dars tayyorlandi.`,
      teacher_message: `Answer event ${Number(first.answer_event_id || target.source_answer_event_id) || "legacy"}; ${target.evidence_state} holat, ishonch ${Math.round(Number(target.confidence || 0) * 100)}%.`,
    },
    learning_objective: `${target.skill_name} qoidasini tushunish va aynan shu turdagi xatoni takrorlamaslik: ${template.objective}`,
    micro_explanation: { rule, examples: lessonExamples(exercises, rule) },
    student_error_examples: errorExamples,
    worked_examples: worked,
    guided_practice: exerciseSummary(exercises, "guided_practice"),
    independent_practice: exerciseSummary(exercises, "independent_practice"),
    error_correction: exerciseSummary(exercises, "error_correction"),
    transfer_practice: exerciseSummary(exercises, "transfer_practice"),
    final_check: exerciseSummary(exercises, "final_check"),
    review_plan: [0, 1, 3, 7, 21].map((delay) => ({ delay_days: delay, question_count: 5 })),
    mastery_criteria: { required_correct: 8, total_questions: 10, required_successful_attempts: 2 },
  };
}

function validString(value, max = 4000) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function normalizeAiLesson(candidate, target, fallback, ruleContract = null) {
  if (!candidate || typeof candidate !== "object" || candidate.schema_version !== LESSON_SCHEMA_VERSION
      || Number(candidate.target_skill_id) !== Number(target.taxonomy_id)
      || !validString(candidate.lesson_title, 300) || !validString(candidate.learning_objective)
      || !candidate.diagnostic_summary || !validString(candidate.diagnostic_summary.student_message)
      || !validString(candidate.diagnostic_summary.teacher_message)
      || !candidate.micro_explanation || !validString(candidate.micro_explanation.rule)
      || !Array.isArray(candidate.micro_explanation.examples)
      || !Array.isArray(candidate.worked_examples)) return null;
  if (microExplanationRuleWarnings(candidate.micro_explanation.rule,target,ruleContract).length > 0) return null;
  const safeExamples = candidate.micro_explanation.examples.map((item) => {
    if (!item || !validString(item.sentence, 1000) || !validString(item.rule_application, 2000)) return null;
    return { sentence: text(item.sentence, 1000), rule_application: text(item.rule_application, 2000) };
  });
  if (safeExamples.length !== LESSON_EXERCISE_COUNT || safeExamples.includes(null)) return null;
  if (learningTextDuplicateIndexes(safeExamples.map((item) => item.sentence)).length > 0) return null;
  if (safeExamples.some((item) => !lessonExampleMatchesCanonicalRule(item.sentence,target))) return null;
  if (safeExamples.some((item) => /\buchinchidan\s+shaxs\b/i.test(item.rule_application))) return null;
  if (lessonRuleApplicationWarnings(safeExamples,target).length > 0) return null;
  const safeWorked = candidate.worked_examples.slice(0, 5).map((item) => {
    if (!item || !validString(item.prompt) || !validString(item.correct || item.answer)
        || !validString(item.reasoning)) return null;
    return {
      prompt: text(item.prompt), incorrect: text(item.incorrect),
      correct: text(item.correct || item.answer), reasoning: text(item.reasoning),
    };
  });
  if (safeWorked.includes(null)) return null;
  return {
    ...fallback,
    lesson_title: text(candidate.lesson_title, 300),
    diagnostic_summary: {
      student_message: fallback.diagnostic_summary.student_message,
      teacher_message: fallback.diagnostic_summary.teacher_message,
    },
    learning_objective: text(candidate.learning_objective),
    micro_explanation: {
      rule: text(candidate.micro_explanation.rule),
      examples: safeExamples,
    },
    worked_examples: fallback.worked_examples,
  };
}

function personalizeSharedLesson(sharedContent,target,fallback,validateRuleContract = null) {
  if (!sharedContent || typeof sharedContent !== "object") return null;
  const normalized = normalizeAiLesson({
    ...fallback,
    ...sharedContent,
    source_error: fallback.source_error,
    diagnostic_summary: fallback.diagnostic_summary,
    student_error_examples: fallback.student_error_examples,
    worked_examples: fallback.worked_examples,
  },target,fallback,sharedContent.rule_contract);
  if (!normalized) return null;
  const scope = canonicalRuleScope(target);
  if (!scope || scope.type !== "rule") return normalized;
  if (typeof validateRuleContract !== "function"
      || !validateRuleContract(sharedContent.rule_contract,scope.key)) return null;
  return { ...normalized,rule_contract: sharedContent.rule_contract };
}

function lessonGenerationPayload(target, fallback, reviewFeedback = "", ruleContract = null) {
  const ruleScope = canonicalRuleScope(target);
  return {
    cefr_level: target.cefr_level,
    target_skill: {
      id: Number(target.taxonomy_id), name: target.skill_name,
      description: target.taxonomy_description,
      rule_signature: ruleScope && ruleScope.type === "rule" ? ruleScope.key : null,
      rule_signature_version: ruleScope && ruleScope.type === "rule" ? ruleScope.version : null,
      rule_signature_confidence: Number(target.rule_signature_confidence || target.confidence),
      rule_signature_reviewed: Boolean(target.rule_signature_reviewed),
      generation_constraints: canonicalRuleTeachingConstraints(target),
      evidence_state: target.evidence_state, confidence: Number(target.confidence),
      mastery: Number(target.mastery_score), evidence: target.evidence,
    },
    student_error_examples: fallback.student_error_examples,
    source_error: fallback.source_error,
    pedagogical_profile: fallback.pedagogical_profile,
    rule_contract: ruleContract,
    review_feedback: text(reviewFeedback,2000),
  };
}

function approvedRuleContractReview(review) {
  const keys = ["exact_source_alignment","signature_coverage","adjacent_rules_excluded","constraints_actionable"];
  return Boolean(review && review.approved === true && Number(review.confidence) >= 0.9
    && review.checks && keys.every((key) => review.checks[key] === true)
    && Array.isArray(review.warnings) && review.warnings.length === 0);
}

async function resolveRuleContract({ aiService,target,fallback,logger = console }) {
  if (typeof aiService.generatePersonalizedRuleContract !== "function") {
    return { contract: null,warning: "AI_RULE_CONTRACT_GENERATION_FAILED" };
  }
  if (typeof aiService.reviewPersonalizedRuleContract !== "function") {
    return { contract: null,warning: "AI_RULE_CONTRACT_REVIEW_UNAVAILABLE" };
  }
  const base = lessonGenerationPayload(target,fallback);
  const evidence = {
    cefr_level: base.cefr_level,
    canonical_rule_signature: base.target_skill.rule_signature,
    target_skill: base.target_skill,
    source_error: fallback.source_error,
  };
  try {
    const generated = await aiService.generatePersonalizedRuleContract(evidence);
    if (!generated || !generated.contract) {
      if (generated && generated.error) logger.error("Rule contract generation fallback:",generated.error);
      return { contract: null,warning: "AI_RULE_CONTRACT_GENERATION_FAILED" };
    }
    const proposedContract = canonicalizeRuleContract(generated.contract,target);
    const deterministic = deterministicRuleContractReview(proposedContract,target);
    if (deterministic.supported && !deterministic.approved) {
      return { contract: null,warning: "AI_RULE_CONTRACT_REJECTED" };
    }
    const reviewed = await aiService.reviewPersonalizedRuleContract({
      ...evidence,proposed_contract: proposedContract,
    });
    if (!reviewed || !reviewed.review) {
      if (reviewed && reviewed.error) logger.error("Rule contract review fallback:",reviewed.error);
      return { contract: null,warning: "AI_RULE_CONTRACT_REVIEW_UNAVAILABLE" };
    }
    if (!approvedRuleContractReview(reviewed.review)) {
      return { contract: null,warning: "AI_RULE_CONTRACT_REJECTED" };
    }
    return { contract: proposedContract,warning: null };
  } catch (error) {
    logger.error("Rule contract generation fallback:",error.message);
    return { contract: null,warning: "AI_RULE_CONTRACT_GENERATION_FAILED" };
  }
}

function approvedLessonReview(review) {
  const requiredChecks = [
    "exact_rule_scope", "grammatical_accuracy", "uzbek_explanations",
    "spelling_quality", "examples_match_rule",
  ];
  return Boolean(review && review.approved === true && Number(review.confidence) >= 0.9
    && review.checks && requiredChecks.every((key) => review.checks[key] === true)
    && Array.isArray(review.warnings) && review.warnings.length === 0);
}

function lessonReviewFeedback(review) {
  if (validString(review && review.retry_feedback,2000)) return text(review.retry_feedback,2000);
  const warnings = Array.isArray(review && review.warnings) ? review.warnings : [];
  return text(warnings.map((warning) => warning && (warning.message || warning.code)).filter(Boolean).join("; "),2000)
    || "Exact rule scope, English accuracy, Uzbek explanations, and spelling must all be corrected.";
}

function canonicalScopeOnlyWarning(warning) {
  const code = text(warning && warning.code,100).toLowerCase();
  const message = text(warning && warning.message,1000).toLowerCase();
  if (!["example_error","examples_mismatch","grammatical_error"].includes(code)) return false;
  if (/spelling|uzbek|tense|word order|agreement|polarity|question|negative|auxiliary/.test(message)) return false;
  return /noun objects?|collocations?|required patterns?|allowed|examples?.*(?:match|align|follow)/.test(message);
}

function reconcileLessonReview(review,lesson,target) {
  if (!review || typeof review !== "object" || !review.checks || !Array.isArray(review.warnings)) {
    return review;
  }
  const examples = lesson && lesson.micro_explanation && lesson.micro_explanation.examples;
  const deterministic = deterministicLessonExampleReview(examples,target);
  if (!deterministic.supported || !deterministic.approved || review.warnings.length === 0
      || lessonRuleApplicationWarnings(examples,target).length > 0
      || !review.warnings.every(canonicalScopeOnlyWarning)
      || review.checks.exact_rule_scope !== true || review.checks.uzbek_explanations !== true
      || review.checks.spelling_quality !== true) return review;
  const mayOverrideGrammar = target && target.rule_signature
    === "grammar.present_simple.third_person_singular_affirmative.do_to_does";
  if (review.checks.grammatical_accuracy !== true && !mayOverrideGrammar) return review;
  const checks = {
    ...review.checks,
    grammatical_accuracy: review.checks.grammatical_accuracy === true || mayOverrideGrammar,
    examples_match_rule: true,
  };
  return {
    ...review,
    approved: Object.values(checks).every((value) => value === true),
    confidence: Math.max(0.9,Number(review.confidence) || 0),
    checks,
    warnings: [],
    retry_feedback: "",
  };
}

async function resolveGeneratedLesson({ aiService, target, fallback, logger = console }) {
  if (!aiService || typeof aiService.generatePersonalizedLesson !== "function") {
    return { lesson: fallback, source: "fallback", warnings: [] };
  }
  const contractResult = await resolveRuleContract({ aiService,target,fallback,logger });
  if (!contractResult.contract) {
    return { lesson: fallback,source: "fallback",warnings: [contractResult.warning] };
  }
  try {
    let feedback = "";
    let reviewAttempts = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const payload = lessonGenerationPayload(target,fallback,feedback,contractResult.contract);
      const generated = await aiService.generatePersonalizedLesson(payload);
      if (generated && generated.error) {
        logger.error("Personalized lesson AI fallback:", generated.error);
        return { lesson: fallback, source: "fallback", warnings: ["AI_GENERATION_FAILED"] };
      }
      const normalized = normalizeAiLesson(
        generated && generated.lesson,target,fallback,contractResult.contract
      );
      if (!normalized) {
        const rawExamples = generated && generated.lesson && generated.lesson.micro_explanation
          && generated.lesson.micro_explanation.examples;
        const ruleMismatch = Array.isArray(rawExamples) && rawExamples.some((item) => (
          !lessonExampleMatchesCanonicalRule(item && item.sentence,target)
        ));
        const wordingMismatch = Array.isArray(rawExamples) && rawExamples.some((item) => (
          /\buchinchidan\s+shaxs\b/i.test(text(item && item.rule_application,2000))
        ));
        const applicationWarnings = lessonRuleApplicationWarnings(rawExamples,target);
        feedback = ruleMismatch
          ? `Replace every out-of-scope or unnatural example. ${canonicalRuleTeachingConstraints(target).join(" ")}`
          : wordingMismatch
            ? "Replace 'uchinchidan shaxs' with natural Uzbek wording such as 'uchinchi shaxs birlikda'."
            : applicationWarnings.includes("CONTENT_RULE_APPLICATION_TARGET_MISSING")
              ? "Every rule_application must name the exact target form visibly used in its own sentence."
              : applicationWarnings.includes("CONTENT_RULE_APPLICATION_DUPLICATE")
                ? "Write ten distinct, sentence-specific rule_application explanations; do not copy one generic explanation."
          : "Return the required schema with exactly 10 valid examples for the exact rule.";
        continue;
      }
      if (typeof aiService.reviewPersonalizedLesson !== "function") {
        return { lesson: fallback, source: "fallback", warnings: ["AI_LESSON_REVIEW_UNAVAILABLE"] };
      }
      const reviewed = await aiService.reviewPersonalizedLesson({
        cefr_level: target.cefr_level,
        authoritative_target: payload.target_skill,
        rule_contract: contractResult.contract,
        source_error: fallback.source_error,
        candidate_lesson: normalized,
      });
      if (!reviewed || !reviewed.review) {
        if (reviewed && reviewed.error) logger.error("Personalized lesson review fallback:",reviewed.error);
        return { lesson: fallback, source: "fallback", warnings: ["AI_LESSON_REVIEW_UNAVAILABLE"] };
      }
      reviewAttempts += 1;
      const reconciledReview = reconcileLessonReview(reviewed.review,normalized,target);
      if (approvedLessonReview(reconciledReview)) {
        return {
          lesson: { ...normalized,rule_contract: contractResult.contract },
          source: "ai",
          warnings: [],
        };
      }
      feedback = lessonReviewFeedback(reconciledReview);
    }
    return { lesson: fallback, source: "fallback", warnings: [reviewAttempts
      ? "AI_LESSON_SEMANTIC_REVIEW_FAILED" : "AI_LESSON_REJECTED"] };
  } catch (error) {
    logger.error("Personalized lesson AI fallback:", error.message);
    return { lesson: fallback, source: "fallback", warnings: ["AI_GENERATION_FAILED"] };
  }
}

async function resolveLessonWithEvidence({ aiService, target, fallback, evidence, logger = console }) {
  if (!evidence || evidence.exercises.length < LESSON_EXERCISE_COUNT) {
    return { lesson: fallback, source: "fallback", warnings: ["INSUFFICIENT_APPROVED_EXERCISES"] };
  }
  return resolveGeneratedLesson({ aiService, target, fallback, logger });
}

function createPersonalizedLessonService({ pool, aiService, logger = console }) {
  const aiExercises = createAiRemediationExerciseService({ pool, aiService, logger });
  const contentCache = createRemediationContentCacheService({
    pool, schemaVersion: LESSON_SCHEMA_VERSION, promptVersion: LESSON_PROMPT_VERSION,
    validateRuleContract: aiService && aiService.validatePersonalizedRuleContract,
  });

  async function loadTargets(studentId, taxonomyId = null, answerEventId = null) {
    const result = await pool.query(
      `SELECT ae.id AS source_answer_event_id,f.id AS finding_id,exact.taxonomy_id,
              COALESCE(f.finding_code,'single-error-' || ae.id::text) AS finding_code,
              COALESCE(f.finding_type,'single_answer_error') AS finding_type,
              COALESCE(f.severity,'medium') AS severity,
              COALESCE(f.confidence,p.confidence_score,0.75) AS confidence,
              COALESCE(f.evidence_state,'OBSERVED') AS evidence_state,1 AS occurrence_count,
              jsonb_build_object('answer_event_id',ae.id,'question_id',ae.question_id,
                'selected_option',ae.selected_option,'correct_option',ae.correct_option) AS evidence,
              COALESCE(f.recommended_action,'single_error_lesson') AS recommended_action,
              t.name AS skill_name,t.description AS taxonomy_description,t.legacy_skill,t.node_type,t.slug,
              COALESCE(p.current_priority,50) AS priority,COALESCE(p.mastery_score,0) AS mastery_score,
              COALESCE(p.confidence_score,ae.question_diagnostic_eligible::int,0) AS confidence_score,
              u.first_name,u.cefr_level,qa.rule_signature,qa.rule_signature_version,
              qa.rule_signature_confidence,qa.rule_signature_reviewed
       FROM student_answer_events ae
       CROSS JOIN LATERAL (
         SELECT id AS taxonomy_id FROM unnest(ARRAY[
           ae.micro_skill_id,ae.subskill_id,ae.topic_id,ae.main_skill_id
         ]::bigint[]) WITH ORDINALITY AS candidate(id,position)
         WHERE id IS NOT NULL ORDER BY position LIMIT 1
       ) exact
       JOIN learning_taxonomy t ON t.id=exact.taxonomy_id AND t.is_active=true
       JOIN users u ON u.id=ae.student_id
       LEFT JOIN question_ai_analysis qa ON qa.question_id=ae.question_id
       LEFT JOIN student_skill_profiles p
         ON p.student_id=ae.student_id AND p.taxonomy_id=exact.taxonomy_id
       LEFT JOIN LATERAL (
         SELECT item.* FROM learning_findings item
         WHERE item.student_id=ae.student_id AND item.is_active=true
           AND item.taxonomy_id=ANY(ARRAY[
             ae.micro_skill_id,ae.subskill_id,ae.topic_id,ae.main_skill_id
           ]::bigint[])
         ORDER BY (item.taxonomy_id=exact.taxonomy_id) DESC,item.confidence DESC,item.id DESC LIMIT 1
       ) f ON true
       WHERE ae.student_id=$1 AND ae.is_correct=false AND ae.question_diagnostic_eligible=true
         AND ($3::bigint IS NULL OR ae.id=$3)
         AND ($2::bigint IS NULL OR $2=ANY(ARRAY[
           ae.micro_skill_id,ae.subskill_id,ae.topic_id,ae.main_skill_id
         ]::bigint[]))
         AND NOT EXISTS (
           SELECT 1 FROM remediation_plans rp
           WHERE rp.student_id=ae.student_id AND rp.source_answer_event_id=ae.id
             AND rp.status NOT IN ('STABLE','MASTERED','TEACHER_REVIEW_REQUIRED')
             AND NOT EXISTS (
               SELECT 1 FROM personalized_lessons stale_lesson
               WHERE stale_lesson.remediation_plan_id=rp.id AND stale_lesson.schema_version<>$4
                 AND t.node_type<>'micro_skill'
             )
         )
       ORDER BY COALESCE(p.current_priority,50) DESC,ae.answered_at DESC,ae.id DESC
       LIMIT 10`,
      [studentId, taxonomyId, answerEventId, LESSON_SCHEMA_VERSION]
    );
    return result.rows;
  }

  async function loadErrors(studentId, target) {
    const result = await pool.query(
      `SELECT ae.id AS answer_event_id,ae.question_id,COALESCE(q.question_text,'') AS question_text,
              COALESCE(q.explanation,'') AS explanation,
              CASE ae.selected_option WHEN 'A' THEN q.option_a WHEN 'B' THEN q.option_b
                   WHEN 'C' THEN q.option_c WHEN 'D' THEN q.option_d ELSE ae.selected_option END AS selected_answer,
              CASE ae.correct_option WHEN 'A' THEN q.option_a WHEN 'B' THEN q.option_b
                   WHEN 'C' THEN q.option_c WHEN 'D' THEN q.option_d ELSE ae.correct_option END AS correct_answer
       FROM student_answer_events ae
       LEFT JOIN questions q ON q.id=ae.question_id
       WHERE ae.student_id=$1 AND ae.is_correct=false AND ae.question_diagnostic_eligible=true
         AND (($3::bigint IS NOT NULL AND ae.id=$3) OR ($3::bigint IS NULL
           AND $2=ANY(ARRAY[ae.main_skill_id,ae.topic_id,ae.subskill_id,ae.micro_skill_id]::bigint[])))
       ORDER BY ae.answered_at DESC LIMIT CASE WHEN $3::bigint IS NULL THEN 6 ELSE 1 END`,
      [studentId, target.taxonomy_id, target.source_answer_event_id || null]
    );
    return result.rows;
  }

  async function loadEvidence(target, errors) {
    const bankScope = exactQuestionBankScope(target);
    const questions = bankScope ? await pool.query(
      `WITH RECURSIVE lineage AS (
         SELECT id,parent_id,0 AS depth FROM learning_taxonomy WHERE id=$1
         UNION ALL
         SELECT t.id,t.parent_id,l.depth+1 FROM learning_taxonomy t JOIN lineage l ON l.parent_id=t.id
       )
       SELECT DISTINCT ON (q.id) q.*,qa.question_type,l.depth
       FROM lineage l
       JOIN question_taxonomy_tags qt ON qt.taxonomy_id=l.id AND l.depth=0
       JOIN questions q ON q.id=qt.question_id
       JOIN question_ai_analysis qa ON qa.question_id=q.id
       WHERE q.diagnostic_eligible=true AND qa.diagnostic_eligible=true
         AND qa.rule_signature=$2
         AND qa.rule_signature_version=$3
         AND qa.rule_signature_reviewed=true
         AND qa.rule_signature_confidence>=0.9
         AND (q.status IS NULL OR q.status IN ('active','published','remediation'))
       ORDER BY q.id,l.depth ASC
       LIMIT 30`,
      [target.taxonomy_id,bankScope.key,bankScope.version]
    ) : { rows: [] };
    const originals = new Set(errors.map((item) => text(item.question_text).toLowerCase()).filter(Boolean));
    const approved = selectApprovedExercises(questions.rows, originals, target.cefr_level);
    const generated = await aiExercises.ensureExercises({
      target, existingQuestions: approved, learnerErrors: errors,
      desiredCount: LESSON_EXERCISE_COUNT,
      reuseExistingQuestions: Boolean(bankScope),
    });
    const complete = selectApprovedExercises([...approved, ...generated], originals, target.cefr_level);
    return { errors, exercises: makeExercises(complete) };
  }

  async function acquirePlan(studentId, target) {
    const retry = await pool.query(
      `UPDATE remediation_plans
       SET source_finding_id=$3,status='GENERATING',priority=$4,evidence_snapshot=$5::jsonb,updated_at=NOW()
       WHERE student_id=$1 AND taxonomy_id=$2
         AND (status='TEACHER_REVIEW_REQUIRED' OR ($8::boolean AND EXISTS (
           SELECT 1 FROM personalized_lessons stale_lesson
           WHERE stale_lesson.remediation_plan_id=remediation_plans.id
             AND stale_lesson.schema_version<>$7
         )))
         AND (($6::bigint IS NOT NULL AND source_answer_event_id=$6)
           OR ($6::bigint IS NULL AND source_answer_event_id IS NULL))
      RETURNING id`,
      [studentId, target.taxonomy_id, target.finding_id, target.priority,
        JSON.stringify(remediationEvidenceSnapshot(target)),target.source_answer_event_id || null,
        LESSON_SCHEMA_VERSION,!canReuseQuestionBank(target)]
    );
    if (retry.rows[0]) return retry.rows[0];
    const result = await pool.query(
      `INSERT INTO remediation_plans
         (student_id,taxonomy_id,source_finding_id,source_answer_event_id,status,priority,evidence_snapshot)
       VALUES ($1,$2,$3,$6,'GENERATING',$4,$5::jsonb)
       ON CONFLICT DO NOTHING RETURNING id`,
      [studentId, target.taxonomy_id, target.finding_id, target.priority,
        JSON.stringify(remediationEvidenceSnapshot(target)),target.source_answer_event_id || null]
    );
    return result.rows[0] || null;
  }

  async function persistLesson(studentId, target, planId, lesson, exercises, source, warnings) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exactBank = canReuseQuestionBank(target);
      const exactRuleResolved = exactBank || source === "ai";
      const contentWarnings = lessonContentWarnings(lesson,exercises,target);
      const allWarnings = [...new Set([...(warnings || []),...contentWarnings])];
      const hasBlockingWarning = allWarnings.some((warning) => BLOCKING_QUALITY_WARNINGS.has(warning));
      const qualityStatus = exercises.length === LESSON_EXERCISE_COUNT && exactRuleResolved
        && contentWarnings.length === 0 && !hasBlockingWarning
        ? "APPROVED" : "REVIEW_REQUIRED";
      const status = qualityStatus === "APPROVED" ? "ASSIGNED" : "READY";
      const existing = await client.query(
        `SELECT id FROM personalized_lessons WHERE remediation_plan_id=$1 FOR UPDATE`, [planId]
      );
      let saved;
      if (existing.rows[0]) {
        await client.query(
          `DELETE FROM personalized_lesson_exercises WHERE lesson_id=$1`, [existing.rows[0].id]
        );
        saved = await client.query(
          `UPDATE personalized_lessons
           SET student_id=$2,taxonomy_id=$3,schema_version=$4,prompt_version=$5,generation_source=$6,
               quality_status=$7,quality_warnings=$8::jsonb,status=$9,progress_percent=0,
               lesson_content=$10::jsonb,content_hash=$11,started_at=NULL,completed_at=NULL,updated_at=NOW()
           WHERE id=$1 RETURNING *`,
          [existing.rows[0].id,studentId,target.taxonomy_id,LESSON_SCHEMA_VERSION,LESSON_PROMPT_VERSION,
            source,qualityStatus,JSON.stringify(allWarnings),status,JSON.stringify(lesson),hashContent(lesson)]
        );
      } else {
        saved = await client.query(
          `INSERT INTO personalized_lessons
           (remediation_plan_id,student_id,taxonomy_id,schema_version,prompt_version,generation_source,
            quality_status,quality_warnings,status,lesson_content,content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11) RETURNING *`,
          [planId,studentId,target.taxonomy_id,LESSON_SCHEMA_VERSION,LESSON_PROMPT_VERSION,source,
            qualityStatus,JSON.stringify(allWarnings),status,JSON.stringify(lesson),hashContent(lesson)]
        );
      }
      for (const exercise of exercises) {
        await client.query(
          `INSERT INTO personalized_lesson_exercises
             (lesson_id,source_question_id,section,position,question_format,prompt,options,correct_option,explanation)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
          [saved.rows[0].id,exercise.source_question_id,exercise.section,exercise.position,
            exercise.question_format,exercise.prompt,JSON.stringify(exercise.options),
            exercise.correct_option,exercise.explanation]
        );
      }
      const planStatus = qualityStatus === "APPROVED" ? "ASSIGNED" : "TEACHER_REVIEW_REQUIRED";
      await client.query(
        `UPDATE remediation_plans SET status=$2::varchar,assigned_at=CASE WHEN $2::varchar='ASSIGNED' THEN NOW() ELSE assigned_at END,
           updated_at=NOW() WHERE id=$1`, [planId,planStatus]
      );
      await client.query(
        `INSERT INTO remediation_history (remediation_plan_id,student_id,from_status,to_status,event_type,event_payload)
         VALUES ($1,$2,'GENERATING',$3,'LESSON_CREATED',$4::jsonb)`,
        [planId,studentId,planStatus,JSON.stringify({ lesson_id: saved.rows[0].id, generation_source: source,
          exercise_count: exercises.length, warnings: allWarnings })]
      );
      if (qualityStatus === "APPROVED") {
        await client.query(
          `UPDATE student_skill_profiles SET current_evidence_state='REMEDIATING',updated_at=NOW()
           WHERE student_id=$1 AND taxonomy_id=$2`, [studentId,target.taxonomy_id]
        );
      }
      await client.query("COMMIT");
      return saved.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function createForTarget(studentId, target) {
    const errors = await loadErrors(studentId, target);
    const claim = await contentCache.acquire(target);
    if (claim.pending && !claim.cached) return { generation_pending: true };
    let plan = null;
    try {
      plan = await acquirePlan(studentId, target);
      if (!plan) return null;
      if (claim.cached) {
        const fallback = fallbackLesson(target, errors, claim.cached.exercises);
        const lesson = personalizeSharedLesson(claim.cached.sharedContent,target,fallback,
          aiService && aiService.validatePersonalizedRuleContract);
        if (lesson) {
          return await persistLesson(studentId,target,plan.id,lesson,claim.cached.exercises,
            claim.cached.source,claim.cached.warnings);
        }
      }
      const evidence = await loadEvidence(target, errors);
      const fallback = fallbackLesson(target, evidence.errors, evidence.exercises);
      const generated = await resolveLessonWithEvidence({ aiService, target, fallback, evidence, logger });
      const { lesson, source } = generated;
      const formats = new Set(evidence.exercises.map((item) => item.question_format));
      const warnings = [...generated.warnings];
      if (evidence.exercises.length < LESSON_EXERCISE_COUNT
          && !warnings.includes("INSUFFICIENT_APPROVED_EXERCISES")) {
        warnings.push("INSUFFICIENT_APPROVED_EXERCISES");
      }
      if (!canReuseQuestionBank(target) && source !== "ai") warnings.push("EXACT_RULE_AI_REQUIRED");
      if (formats.size < 2) warnings.push("LIMITED_FORMAT_DIVERSITY");
      return await persistLesson(studentId,target,plan.id,lesson,evidence.exercises,source,warnings);
    } catch (error) {
      if (plan) {
        await pool.query(
          `UPDATE remediation_plans SET status='TEACHER_REVIEW_REQUIRED',updated_at=NOW() WHERE id=$1`,
          [plan.id]
        );
      }
      logger.error("Personalized lesson generation xatosi:", error.message);
      throw error;
    } finally {
      await contentCache.release(claim.lease);
    }
  }

  async function syncLessons(studentId, taxonomyId = null, answerEventId = null) {
    const targets = await loadTargets(studentId, taxonomyId, answerEventId);
    const results = [];
    for (const target of targets) {
      results.push(await createForTarget(studentId, target));
    }
    return summarizeLessonGeneration(targets.length, results);
  }

  async function listLessons(studentId) {
    const result = await pool.query(
      `SELECT l.id,l.status,l.progress_percent,l.quality_status,l.generation_source,l.lesson_content,
              l.created_at,l.started_at,l.completed_at,rp.status AS remediation_status,
              rp.source_answer_event_id,
              t.id AS target_skill_id,t.name AS target_skill_name,
              COUNT(e.id)::int AS exercise_count,
              COUNT(a.id)::int AS answered_count,
              COUNT(a.id) FILTER (WHERE a.is_correct)::int AS correct_count
       FROM personalized_lessons l
       JOIN remediation_plans rp ON rp.id=l.remediation_plan_id
       JOIN learning_taxonomy t ON t.id=l.taxonomy_id
       LEFT JOIN personalized_lesson_exercises e ON e.lesson_id=l.id AND e.quality_status='APPROVED'
       LEFT JOIN personalized_lesson_exercise_attempts a ON a.exercise_id=e.id AND a.student_id=l.student_id
       WHERE l.student_id=$1 AND l.quality_status='APPROVED'
         AND (l.schema_version=$2 OR t.node_type='micro_skill')
       GROUP BY l.id,rp.status,rp.source_answer_event_id,t.id,t.name
       ORDER BY CASE l.status WHEN 'STARTED' THEN 1 WHEN 'ASSIGNED' THEN 2 ELSE 3 END,l.created_at DESC
       LIMIT 20`, [studentId, LESSON_SCHEMA_VERSION]
    );
    return result.rows;
  }

  async function getLesson(studentId, lessonId) {
    const lesson = await pool.query(
      `SELECT l.*,rp.status AS remediation_status,t.name AS target_skill_name
       FROM personalized_lessons l JOIN remediation_plans rp ON rp.id=l.remediation_plan_id
       JOIN learning_taxonomy t ON t.id=l.taxonomy_id
       WHERE l.id=$1 AND l.student_id=$2 AND l.quality_status='APPROVED'
         AND (l.schema_version=$3 OR t.node_type='micro_skill')`,
      [lessonId,studentId,LESSON_SCHEMA_VERSION]
    );
    if (!lesson.rows[0]) return null;
    const exercises = await pool.query(
      `SELECT e.id,e.section,e.position,e.question_format,e.prompt,e.options,
              a.selected_option,a.is_correct,a.answered_at,
              CASE WHEN a.id IS NULL THEN NULL ELSE e.correct_option END AS correct_option,
              CASE WHEN a.id IS NULL THEN NULL ELSE e.explanation END AS explanation
       FROM personalized_lesson_exercises e
       LEFT JOIN personalized_lesson_exercise_attempts a
         ON a.exercise_id=e.id AND a.student_id=$2
       WHERE e.lesson_id=$1 AND e.quality_status='APPROVED'
       ORDER BY e.position`, [lessonId,studentId]
    );
    return { ...lesson.rows[0], exercises: exercises.rows };
  }

  async function startLesson(studentId, lessonId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT remediation_plan_id,status FROM personalized_lessons
         WHERE id=$1 AND student_id=$2 AND status IN ('ASSIGNED','STARTED') FOR UPDATE`,
        [lessonId,studentId]
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      const lesson = result.rows[0];
      if (lesson.status === "ASSIGNED") {
        await client.query(
          `UPDATE personalized_lessons SET status='STARTED',started_at=NOW(),updated_at=NOW() WHERE id=$1`,
          [lessonId]
        );
        await client.query(
          `UPDATE remediation_plans SET status='STARTED',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
           WHERE id=$1 AND status IN ('ASSIGNED','STARTED')`, [lesson.remediation_plan_id]
        );
        await client.query(
          `INSERT INTO remediation_history
             (remediation_plan_id,student_id,from_status,to_status,event_type,event_payload)
           VALUES ($1,$2,'ASSIGNED','STARTED','LESSON_STARTED',$3::jsonb)`,
          [lesson.remediation_plan_id,studentId,JSON.stringify({ lesson_id: lessonId })]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return getLesson(studentId,lessonId);
  }

  async function answerExercise(studentId, lessonId, exerciseId, selectedOption) {
    const selected = text(selectedOption, 1).toUpperCase();
    if (!VALID_OPTIONS.has(selected)) return { validation_error: true };
    const exercise = await pool.query(
      `SELECT e.id,e.correct_option,e.explanation
       FROM personalized_lesson_exercises e JOIN personalized_lessons l ON l.id=e.lesson_id
       WHERE e.id=$1 AND e.lesson_id=$2 AND l.student_id=$3 AND l.status='STARTED'
         AND e.quality_status='APPROVED'`, [exerciseId,lessonId,studentId]
    );
    if (!exercise.rows[0]) return null;
    const isCorrect = exercise.rows[0].correct_option === selected;
    await pool.query(
      `INSERT INTO personalized_lesson_exercise_attempts
         (lesson_id,exercise_id,student_id,selected_option,is_correct)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (lesson_id,exercise_id,student_id) DO UPDATE SET
         selected_option=EXCLUDED.selected_option,is_correct=EXCLUDED.is_correct,answered_at=NOW()`,
      [lessonId,exerciseId,studentId,selected,isCorrect]
    );
    await pool.query(
      `UPDATE personalized_lessons l SET progress_percent=LEAST(99,ROUND(100.0 * (
         SELECT COUNT(*) FROM personalized_lesson_exercise_attempts a WHERE a.lesson_id=l.id AND a.student_id=$2
       ) / NULLIF((SELECT COUNT(*) FROM personalized_lesson_exercises e WHERE e.lesson_id=l.id),0))::int),updated_at=NOW()
       WHERE l.id=$1 AND l.student_id=$2`, [lessonId,studentId]
    );
    return { is_correct: isCorrect, correct_option: exercise.rows[0].correct_option,
      explanation: exercise.rows[0].explanation };
  }

  async function completeLesson(studentId, lessonId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT l.remediation_plan_id,l.taxonomy_id,l.status,
                (SELECT COUNT(*) FROM personalized_lesson_exercises e WHERE e.lesson_id=l.id) AS total,
                (SELECT COUNT(*) FROM personalized_lesson_exercise_attempts a WHERE a.lesson_id=l.id AND a.student_id=$2) AS answered,
                (SELECT COUNT(*) FROM personalized_lesson_exercise_attempts a
                 WHERE a.lesson_id=l.id AND a.student_id=$2 AND a.is_correct=true) AS correct
         FROM personalized_lessons l WHERE l.id=$1 AND l.student_id=$2 FOR UPDATE`, [lessonId,studentId]
      );
      const lesson = result.rows[0];
      if (!lesson) { await client.query("ROLLBACK"); return null; }
      if (lesson.status === "COMPLETED") { await client.query("COMMIT"); return getLesson(studentId,lessonId); }
      if (Number(lesson.total) === 0 || Number(lesson.answered) < Number(lesson.total)) {
        await client.query("ROLLBACK"); return { incomplete: true, total: Number(lesson.total), answered: Number(lesson.answered) };
      }
      const requiredCorrect = lessonMasteryRequiredCorrect(lesson.total);
      if (Number(lesson.correct) < requiredCorrect) {
        await client.query("ROLLBACK");
        return {
          mastery_not_met: true,
          total: Number(lesson.total),
          answered: Number(lesson.answered),
          correct: Number(lesson.correct),
          required_correct: requiredCorrect,
        };
      }
      await client.query(
        `UPDATE personalized_lessons SET status='COMPLETED',progress_percent=100,completed_at=NOW(),updated_at=NOW()
         WHERE id=$1`, [lessonId]
      );
      await client.query(
        `UPDATE remediation_plans SET status='RETEST_PENDING',completed_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [lesson.remediation_plan_id]
      );
      await client.query(
        `UPDATE student_skill_profiles SET last_lesson_date=NOW(),current_evidence_state='REMEDIATING',updated_at=NOW()
         WHERE student_id=$1 AND taxonomy_id=$2`, [studentId,lesson.taxonomy_id]
      );
      await client.query(
        `INSERT INTO remediation_history (remediation_plan_id,student_id,from_status,to_status,event_type,event_payload)
         VALUES ($1,$2,'STARTED','RETEST_PENDING','LESSON_COMPLETED',$3::jsonb)`,
        [lesson.remediation_plan_id,studentId,JSON.stringify({ lesson_id: lessonId, answered: Number(lesson.answered) })]
      );
      await client.query(
        `UPDATE ai_reports SET is_stale=true,stale_at=NOW() WHERE target_student_id=$1 AND is_stale=false`,
        [studentId]
      );
      await client.query("COMMIT");
      return getLesson(studentId,lessonId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return { syncLessons,listLessons,getLesson,startLesson,answerExercise,completeLesson };
}

module.exports = {
  LESSON_SCHEMA_VERSION,LESSON_PROMPT_VERSION,LESSON_EXERCISE_COUNT,
  isApprovedExercise,selectApprovedExercises,canReuseQuestionBank,remediationEvidenceSnapshot,
  summarizeLessonGeneration,
  makeExercises,grammarInUseProfile,fallbackLesson,lessonContentWarnings,
  lessonRuleApplicationWarnings,
  microExplanationRuleWarnings,
  lessonMasteryRequiredCorrect,
  normalizeAiLesson,personalizeSharedLesson,resolveGeneratedLesson,resolveLessonWithEvidence,
  approvedRuleContractReview,reconcileLessonReview,resolveRuleContract,
  createPersonalizedLessonService,
};
