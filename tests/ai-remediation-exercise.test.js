const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateRemediationExerciseSet,
  remediationExerciseSetValidationError,
  filterValidRemediationQuestions,
  approvedRemediationExerciseIndexes,
  remediationReviewValidationError,
  remediationReviewDiagnostics,
  remediationLearnerErrors,
} = require("../aiService");
const {
  hasValidQuestionPrompt,
  morphologyMatchesCanonicalRule,
  isFirstPersonSingularIAmPrompt,
  isRegularThirdPersonBase,
  isSimpleRegularPastBase,
  validCandidateForRule,
  lessonExampleMatchesCanonicalRule,
  deterministicLessonExampleReview,
  deterministicRuleContractReview,
  canonicalizeRuleContract,
  validCandidate,
  validStoredQuestion,
  exactRuleScope,
  createAiRemediationExerciseService,
} = require("../src/services/aiRemediationExerciseService");
const {
  normalizedLearningText,
  learningTextContainsPhrase,
  tokenDiceSimilarity,
  learningTextDuplicateIndexes,
  selectBalancedCorrectOptions,
} = require("../src/utils/learningContentSimilarity");

test("learning content similarity catches numbered and near-identical copies", () => {
  assert.equal(normalizedLearningText("Example 17!"),"example #");
  assert.equal(learningTextContainsPhrase("Works is correct here.","works"),true);
  assert.equal(learningTextContainsPhrase("This rule applies here.","is"),false);
  assert.ok(tokenDiceSimilarity(
    "The careful student reads the English lesson every morning at home.",
    "The careful student reads the English lesson every evening at home."
  ) >= 0.85);
  assert.deepEqual(learningTextDuplicateIndexes([
    "Example 1 follows the rule.","Example 2 follows the rule.",
    "She reads books after school.",
  ]),[1]);
  assert.deepEqual(learningTextDuplicateIndexes([
    "She reads books after school.","They worked in the library yesterday.",
  ]),[]);
  const balanced = ["A","B","C","D","A","B","C","D","A","B"]
    .map((correct_option) => ({ correct_option }));
  assert.equal(selectBalancedCorrectOptions(balanced,10).length,10);
  assert.deepEqual(selectBalancedCorrectOptions(
    Array.from({ length: 10 },() => ({ correct_option: "A" })),10
  ),[]);
});

test("remediation prompts reject malformed or joined blank markers", () => {
  assert.equal(hasValidQuestionPrompt("She ___ English every day.","gap_fill"),true);
  assert.equal(hasValidQuestionPrompt("She studies English every day.","multiple_choice"),true);
  assert.equal(hasValidQuestionPrompt("My dog always____ outside.","gap_fill"),false);
  assert.equal(hasValidQuestionPrompt("My dog always___ outside.","gap_fill"),false);
  assert.equal(hasValidQuestionPrompt("My dog ___plays outside.","gap_fill"),false);
  assert.equal(hasValidQuestionPrompt("My dog ____ outside.","gap_fill"),false);
  assert.equal(hasValidQuestionPrompt("My dog plays outside.","gap_fill"),false);
  assert.equal(validCandidate({ ...candidate(90),question_text: "My dog always____ outside." },reviewedRule),false);
  assert.equal(validStoredQuestion({
    question_text: "My dog always____ outside.",question_type: "gap_fill",
    option_a: "plays",option_b: "play",option_c: "played",option_d: "playing",
    correct_option: "A",explanation: "Third-person singular takes -s.",
  }),false);
});

const reviewedRule = {
  rule_signature: "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s",
  rule_signature_version: "canonical_rule_signature_v1",
  rule_signature_confidence: 1,
  rule_signature_reviewed: true,
};

const REMEDIATION_CONTEXTS = [
  "She ___ at the language center on Mondays.",
  "My teacher ___ in the school library after lunch.",
  "Her brother ___ from home during the week.",
  "A local doctor ___ at the city clinic each morning.",
  "The new assistant ___ with young children on Fridays.",
  "This engineer ___ on community projects in summer.",
  "Our coach ___ at the sports club before dinner.",
  "The shop manager ___ until six every weekday.",
  "His aunt ___ in a quiet office near the station.",
  "That student ___ at a small cafe on weekends.",
  "The tour guide ___ around the old city in spring.",
  "My neighbor ___ at the bakery before sunrise.",
  "The young artist ___ in a shared studio downtown.",
];
const REMEDIATION_EXPLANATIONS = [
  "Works is correct because She is third-person singular in a repeated Monday routine.",
  "Works is correct because My teacher is one person with a regular after-lunch activity.",
  "Works is correct because Her brother is singular and the sentence describes his weekly routine.",
  "Works is correct because A local doctor is a third-person singular subject in this morning habit.",
  "Works is correct because The new assistant is singular in this recurring Friday situation.",
  "Works is correct because This engineer is one person doing regular summer projects.",
  "Works is correct because Our coach is singular and the action happens before dinner regularly.",
  "Works is correct because The shop manager is one person following a weekday schedule.",
  "Works is correct because His aunt is singular in this description of her usual workplace.",
  "Works is correct because That student is one person with a regular weekend job.",
  "Works is correct because The tour guide is singular in this repeated spring activity.",
  "Works is correct because My neighbor is one person following an early bakery routine.",
  "Works is correct because The young artist is singular in this usual downtown setting.",
];

function candidate(index, confidence = 0.95) {
  const keys = ["A","B","C","D"];
  const correctOption = keys[(Number(index) - 1 + keys.length) % keys.length];
  const distractors = ["work","worked","working"];
  const options = {};
  let distractorIndex = 0;
  for (const key of keys) {
    options[key] = key === correctOption ? "works" : distractors[distractorIndex++];
  }
  return {
    question_type: "gap_fill",
    question_text: REMEDIATION_CONTEXTS[(Number(index) - 1 + REMEDIATION_CONTEXTS.length)
      % REMEDIATION_CONTEXTS.length],
    options,
    correct_option: correctOption,
    explanation: REMEDIATION_EXPLANATIONS[(Number(index) - 1 + REMEDIATION_EXPLANATIONS.length)
      % REMEDIATION_EXPLANATIONS.length],
    review_confidence: confidence,
  };
}

test("generated remediation schemas reject duplicates and accept independently reviewed questions", () => {
  const questions = [candidate(1),candidate(2)];
  const generated = {
    schema_version: "remediation_exercise_set_v1",
    target_taxonomy_id: 44,
    cefr_level: "A1",
    questions,
  };
  const options = { targetTaxonomyId: 44,cefrLevel: "A1",requestedCount: 2,blockedStems: [] };
  assert.equal(validateRemediationExerciseSet(generated,options),true);
  assert.equal(validateRemediationExerciseSet({ ...generated,questions: [questions[0],questions[0]] },options),false);
  assert.equal(remediationExerciseSetValidationError(
    { ...generated,questions: [questions[0],questions[0]] },options
  ),"QUESTION_STEM_DUPLICATED:1");

  const invalidOptions = { ...candidate(3),options: { A: "study",B: "study",C: "studied",D: "studying" } };
  const filtered = filterValidRemediationQuestions(
    { ...generated,questions: [invalidOptions,...questions] },options
  );
  assert.deepEqual(filtered.questions,questions);
  assert.equal(validateRemediationExerciseSet(filtered,options),true);

  const review = {
    schema_version: "remediation_exercise_review_v1",
    target_taxonomy_id: 44,
    reviews: [
      { index: 0,approved: true,confidence: 0.96,exact_rule_match: true,
        correct_key_valid: true,level_valid: true,unambiguous: true,warnings: [] },
      { index: 1,approved: false,confidence: 0.99,exact_rule_match: false,
        correct_key_valid: true,level_valid: true,unambiguous: true,warnings: ["Adjacent rule"] },
    ],
  };
  assert.deepEqual(approvedRemediationExerciseIndexes(review,2,44),[{ index: 0,confidence: 0.96 }]);
  assert.equal(remediationReviewDiagnostics(review,2,44),
    'APPROVED:1/2;REJECTED_FLAGS:{"not_approved":1,"exact_rule":1,"correct_key":0,"level":0,"unambiguous":0,"warnings":1}');
  assert.equal(remediationReviewValidationError(
    { ...review,reviews: review.reviews.slice(0,1) },2,44
  ),"REVIEW_COUNT_MISMATCH:1/2");

  const balancedQuestions = Array.from({ length: 10 },(_,index) => candidate(index + 1));
  const balancedSet = { ...generated,questions: balancedQuestions };
  const tenOptions = { ...options,requestedCount: 10 };
  assert.equal(validateRemediationExerciseSet(balancedSet,tenOptions),true);
  assert.equal(remediationExerciseSetValidationError({
    ...balancedSet,
    questions: balancedQuestions.map((item) => ({
      ...item,
      options: { A: "works",B: "work",C: "worked",D: "working" },
      correct_option: "A",
    })),
  },tenOptions),"CORRECT_OPTIONS_UNBALANCED");
  assert.match(remediationExerciseSetValidationError({
    ...balancedSet,
    questions: balancedQuestions.map((item,index) => ({
      ...item,question_text: `Example ${index + 1} follows the same numbered template.`,
    })),
  },tenOptions),/^QUESTION_STEM_NEAR_DUPLICATED:/);
  assert.equal(remediationExerciseSetValidationError({
    ...balancedSet,
    questions: balancedQuestions.map((item) => ({
      ...item,
      explanation: "Works is correct because a third-person singular subject needs this form.",
    })),
  },tenOptions),"EXPLANATION_NEAR_DUPLICATED:1");
  assert.equal(remediationExerciseSetValidationError({
    ...balancedSet,
    questions: balancedQuestions.map((item,index) => index === 3
      ? { ...item,explanation: "The present-simple rule applies here." }
      : item),
  },tenOptions),"EXPLANATION_ANSWER_MISSING:3");
});

test("deterministic candidate gate rejects low-confidence and ambiguous option sets", () => {
  assert.equal(validCandidate(candidate(1)),true);
  assert.equal(validCandidate(candidate(1,0.89)),false);
  assert.equal(validCandidate({ ...candidate(1),options: { A: "same",B: "same",C: "c",D: "d" } }),false);
});

test("do-to-does canonical gate rejects negative and unnatural adjacent examples", () => {
  const target = {
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.do_to_does",
  };
  const accepted = {
    ...candidate(1),
    question_text: "She ___ her homework every evening.",
    options: { A: "do",B: "does",C: "doing",D: "done" },
    correct_option: "B",
    explanation: "Does is correct because She is third-person singular in this affirmative routine.",
  };
  assert.equal(validCandidateForRule(accepted,target),true);
  assert.equal(validCandidateForRule({ ...accepted,question_text: "She ___ not like apples." },target),false);
  assert.equal(validCandidateForRule({ ...accepted,question_text: "She ___ her friends on weekends." },target),false);
  assert.equal(validCandidate(accepted,target),true);
  assert.equal(lessonExampleMatchesCanonicalRule("He does his homework after school.",target),true);
  assert.equal(lessonExampleMatchesCanonicalRule("It does not rain in summer.",target),false);
  assert.equal(lessonExampleMatchesCanonicalRule("The teacher does the lesson plan carefully.",target),false);
  assert.equal(lessonExampleMatchesCanonicalRule("The dog does the trick perfectly.",target),false);
  assert.equal(lessonExampleMatchesCanonicalRule("Does he do his homework?",target),false);
  assert.equal(lessonExampleMatchesCanonicalRule("It does the laundry on Sundays.",target),false);
  assert.equal(lessonExampleMatchesCanonicalRule("My sister does the laundry on Sundays.",target),true);
  assert.equal(lessonExampleMatchesCanonicalRule("She does her homework yesterday.",target),false);
  assert.deepEqual(deterministicLessonExampleReview(Array.from({ length: 10 }, () => ({
    sentence: "She does her homework every day.",
  })),target),{ supported: true,approved: true,failed_indexes: [] });
});

test("do-to-does rule contract exposes the server-authoritative collocation allow-list", () => {
  const target = {
    rule_signature: "grammar.present_simple.third_person_singular_affirmative.do_to_does",
  };
  const original = {
    source_construction: { complement_pattern: "possessive + homework" },
    eligibility_conditions: ["she only"],
    required_patterns: ["she does her homework"],
    forbidden_patterns: ["does not", "does she"],
  };
  const canonical = canonicalizeRuleContract(original,target);
  assert.match(canonical.source_construction.complement_pattern,/laundry/);
  assert.match(canonical.required_patterns[0],/human third-person singular subject/);
  assert.match(canonical.required_patterns[0],/research/);
  assert.deepEqual(canonical.forbidden_patterns,original.forbidden_patterns);
  assert.deepEqual(canonicalizeRuleContract(original,{ rule_signature: "another.rule" }),original);
});

test("first-person singular to-be gate accepts only affirmative copular I am", () => {
  const signature = "grammar.present_simple.to_be_affirmative.first_person_singular_i_am";
  const target = { rule_signature: signature };
  const accepted = {
    ...candidate(1),
    question_text: "I ___ a student.",
    options: { A: "am",B: "is",C: "are",D: "be" },
    correct_option: "A",
    explanation: "Am is correct because the affirmative copular subject is I.",
  };
  assert.equal(morphologyMatchesCanonicalRule(accepted,signature),true);
  assert.equal(validCandidateForRule(accepted,target),true);
  assert.equal(validCandidate(accepted,target),true);
  assert.equal(validCandidateForRule({ ...accepted,question_text: "He ___ a student." },target),false);
  assert.equal(validCandidateForRule({ ...accepted,question_text: "I ___ not late." },target),false);
  assert.equal(validCandidateForRule({ ...accepted,question_text: "I ___ studying English." },target),false);
  assert.equal(validCandidateForRule({ ...accepted,question_text: "___ I late?" },target),false);
  assert.equal(morphologyMatchesCanonicalRule({
    ...accepted,options: { A: "is",B: "am",C: "are",D: "be" },correct_option: "A",
  },signature),false);
  assert.equal(morphologyMatchesCanonicalRule({
    ...accepted,options: { A: "am",B: "is",C: "are",D: "was" },
  },signature),false);
  assert.equal(isFirstPersonSingularIAmPrompt("i ___ happy."),true);
  assert.equal(isFirstPersonSingularIAmPrompt("i ___ working."),false);
});

test("third-person ending gates accept only their exact orthographic transformation", () => {
  const exercise = (questionText,correct,base) => ({
    ...candidate(1),question_text: questionText,
    options: { A: correct,B: base,C: `${base}ing`,D: `${base}ed` },correct_option: "A",
  });
  const regular = "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s";
  const consonantY = "grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies";
  const vowelY = "grammar.present_simple.third_person_singular_affirmative.vowel_y_add_s";
  const endingO = "grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es";
  const endingCh = "grammar.present_simple.third_person_singular_affirmative.verb_ending_ch_add_es";
  const endingSh = "grammar.present_simple.third_person_singular_affirmative.verb_ending_sh_add_es";
  const regularPastEd = "grammar.past_simple.affirmative.regular_verb_ed";

  assert.equal(morphologyMatchesCanonicalRule(exercise("The bus ___ at seven.","leaves","leave"),regular),true);
  assert.equal(morphologyMatchesCanonicalRule(exercise("My sister ___ English.","studies","study"),regular),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("My sister ___ English.","studies","study"),consonantY),true);
  assert.equal(morphologyMatchesCanonicalRule({
    ...exercise("My sister ___ English.","studies","study"),
    options: { A: "studies",B: "study",C: "studieses",D: "studie" },
  },consonantY),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ every day.","plays","play"),consonantY),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ every day.","plays","play"),vowelY),true);
  assert.equal(morphologyMatchesCanonicalRule(exercise("My sister ___ English.","studies","study"),vowelY),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ every day.","plaies","play"),vowelY),false);
  assert.equal(morphologyMatchesCanonicalRule({
    ...exercise("She ___ every day.","plays","play"),
    options: { A: "plays",B: "play",C: "playses",D: "played" },
  },vowelY),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("He ___ to school.","goes","go"),endingO),true);
  assert.equal(morphologyMatchesCanonicalRule(exercise("He ___ football.","plays","play"),endingO),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ TV.","watches","watch"),endingCh),true);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ TV.","watchs","watch"),endingCh),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("He ___ to school.","goes","go"),endingCh),false);
  assert.equal(morphologyMatchesCanonicalRule({
    ...exercise("She ___ TV.","watches","watch"),
    options: { A: "watches",B: "watch",C: "watcheses",D: "watched" },
  },endingCh),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ the dishes.","washes","wash"),endingSh),true);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ the dishes.","washs","wash"),endingSh),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ TV.","watches","watch"),endingSh),false);
  assert.equal(morphologyMatchesCanonicalRule({
    ...exercise("She ___ the dishes.","washes","wash"),
    options: { A: "washes",B: "wash",C: "washeses",D: "washed" },
  },endingSh),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("Yesterday we ___ English.","learned","learn"),regularPastEd),true);
  assert.equal(morphologyMatchesCanonicalRule(exercise("Yesterday we ___ at home.","lived","live"),regularPastEd),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("Yesterday we ___ English.","studied","study"),regularPastEd),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("Yesterday we ___ here.","stopped","stop"),regularPastEd),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("Yesterday we ___ home.","went","go"),regularPastEd),false);
  assert.equal(morphologyMatchesCanonicalRule({
    ...exercise("Yesterday we ___ English.","learned","learn"),
    options: { A: "learned",B: "learn",C: "learneded",D: "learning" },
  },regularPastEd),false);
  assert.equal(isSimpleRegularPastBase("learn"),true);
  assert.equal(isSimpleRegularPastBase("live"),false);
  assert.equal(isSimpleRegularPastBase("study"),false);
  assert.equal(isSimpleRegularPastBase("stop"),false);
  assert.equal(isSimpleRegularPastBase("go"),false);
  assert.equal(validCandidateForRule(
    exercise("Yesterday we ___ English.","learned","learn"),
    { rule_signature: regularPastEd }
  ),true);
  assert.equal(validCandidateForRule(
    exercise("We ___ English every day.","learned","learn"),
    { rule_signature: regularPastEd }
  ),false);
  assert.equal(isRegularThirdPersonBase("play"),true);
  assert.equal(isRegularThirdPersonBase("watch"),false);
  assert.equal(isRegularThirdPersonBase("study"),false);
  assert.equal(isRegularThirdPersonBase("go"),false);
  assert.equal(isRegularThirdPersonBase("have"),false);
  assert.equal(isRegularThirdPersonBase("can"),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ TV.","watchs","watch"),regular),false);
  assert.equal(morphologyMatchesCanonicalRule(exercise("She ___ a car.","haves","have"),regular),false);
  assert.equal(validCandidateForRule(exercise("They ___ to school.","goes","go"),{ rule_signature: endingO }),false);
  assert.equal(validCandidateForRule(exercise("He ___ not go.","goes","go"),{ rule_signature: endingO }),false);
});

test("lesson example validators enforce exact canonical surface transformations", () => {
  const review = (signature,sentences) => deterministicLessonExampleReview(
    sentences.map((sentence) => ({ sentence })),{ rule_signature: signature }
  );
  const ten = (sentence) => Array.from({ length: 10 },() => sentence);
  const signatures = {
    iAm: "grammar.present_simple.to_be_affirmative.first_person_singular_i_am",
    regular: "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s",
    consonantY: "grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies",
    vowelY: "grammar.present_simple.third_person_singular_affirmative.vowel_y_add_s",
    endingO: "grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es",
    endingCh: "grammar.present_simple.third_person_singular_affirmative.verb_ending_ch_add_es",
    endingSh: "grammar.present_simple.third_person_singular_affirmative.verb_ending_sh_add_es",
    pastEd: "grammar.past_simple.affirmative.regular_verb_ed",
  };
  assert.equal(review(signatures.iAm,ten("I am happy today.")).approved,true);
  assert.equal(review(signatures.iAm,ten("I am studying now.")).approved,false);
  assert.equal(review(signatures.regular,ten("She plays tennis every day.")).approved,true);
  assert.equal(review(signatures.regular,ten("She studies English every day.")).approved,false);
  assert.equal(review(signatures.consonantY,ten("She studies English every day.")).approved,true);
  assert.equal(review(signatures.consonantY,ten("She plays tennis every day.")).approved,false);
  assert.equal(review(signatures.vowelY,ten("She plays tennis every day.")).approved,true);
  assert.equal(review(signatures.vowelY,ten("She studies English every day.")).approved,false);
  assert.equal(review(signatures.endingO,ten("He goes to school every day.")).approved,true);
  assert.equal(review(signatures.endingO,ten("He does his homework every day.")).approved,false);
  assert.equal(review(signatures.endingCh,ten("She watches television every day.")).approved,true);
  assert.equal(review(signatures.endingCh,ten("She washes the dishes every day.")).approved,false);
  assert.equal(review(signatures.endingSh,ten("She washes the dishes every day.")).approved,true);
  assert.equal(review(signatures.endingSh,ten("She watches television every day.")).approved,false);
  assert.equal(review(signatures.pastEd,ten("They learned English yesterday.")).approved,true);
  assert.equal(review(signatures.pastEd,ten("They studied English yesterday.")).approved,false);
  assert.deepEqual(review("unsupported.rule",ten("Any sentence.")),{
    supported: false,approved: false,failed_indexes: [],
  });
});

test("rule contract validators enforce canonical tense polarity and morphology", () => {
  const cases = [
    ["grammar.present_simple.to_be_affirmative.first_person_singular_i_am","be","am"],
    ["grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s","read","reads"],
    ["grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies","study","studies"],
    ["grammar.present_simple.third_person_singular_affirmative.vowel_y_add_s","play","plays"],
    ["grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es","go","goes"],
    ["grammar.present_simple.third_person_singular_affirmative.verb_ending_ch_add_es","watch","watches"],
    ["grammar.present_simple.third_person_singular_affirmative.verb_ending_sh_add_es","wash","washes"],
    ["grammar.present_simple.third_person_singular_affirmative.do_to_does","do","does"],
    ["grammar.past_simple.affirmative.regular_verb_ed","learn","learned"],
  ];
  const makeContract = (signature,base,targetForm) => ({
    canonical_rule_signature: signature,
    source_construction: {
      tense: signature.includes("past_simple") ? "past simple" : "present simple",
      polarity: "affirmative",clause_type: "declarative",
      subject_constraint: signature.includes("first_person")
        ? "first person singular I" : "third person singular",
      grammatical_function: signature.includes("first_person") ? "copular verb" : "lexical main verb",
      base_form: base,target_form: targetForm,
    },
    required_transformation: `Change ${base} to ${targetForm}.`,
    minimal_pair: { invalid: `She ${base} today.`,valid: `She ${targetForm} today.` },
  });
  for (const [signature,base,targetForm] of cases) {
    const target = { rule_signature: signature };
    const contract = makeContract(signature,base,targetForm);
    assert.equal(deterministicRuleContractReview(contract,target).approved,true,signature);
    const wrongTarget = {
      ...contract,source_construction: { ...contract.source_construction,target_form: "wrong" },
    };
    assert.equal(deterministicRuleContractReview(wrongTarget,target).approved,false,signature);
    const wrongTense = {
      ...contract,source_construction: { ...contract.source_construction,tense: "future simple" },
    };
    assert.equal(deterministicRuleContractReview(wrongTense,target).approved,false,signature);
    const wrongPolarity = {
      ...contract,source_construction: { ...contract.source_construction,polarity: "negative" },
    };
    assert.equal(deterministicRuleContractReview(wrongPolarity,target).approved,false,signature);
    const wrongClause = {
      ...contract,source_construction: { ...contract.source_construction,clause_type: "interrogative" },
    };
    assert.equal(deterministicRuleContractReview(wrongClause,target).approved,false,signature);
    const wrongFunction = {
      ...contract,source_construction: { ...contract.source_construction,grammatical_function: "auxiliary" },
    };
    assert.equal(deterministicRuleContractReview(wrongFunction,target).approved,false,signature);
    if (signature.includes("person_singular")) {
      const wrongSubject = {
        ...contract,source_construction: { ...contract.source_construction,subject_constraint: "plural" },
      };
      assert.equal(deterministicRuleContractReview(wrongSubject,target).approved,false,signature);
    }
  }
  assert.deepEqual(deterministicRuleContractReview({}, { rule_signature: "unsupported.rule" }),{
    supported: false,approved: false,failed_fields: [],
  });
});

test("shared remediation persistence requires a reviewed canonical rule", () => {
  assert.deepEqual(exactRuleScope(reviewedRule), {
    key: reviewedRule.rule_signature,
    version: reviewedRule.rule_signature_version,
  });
  assert.equal(exactRuleScope({ ...reviewedRule,rule_signature_reviewed: false }),null);
  assert.equal(exactRuleScope({ ...reviewedRule,rule_signature_confidence: 0.89 }),null);
});

test("learner error normalization preserves question_text as the exact AI rule source", () => {
  assert.deepEqual(remediationLearnerErrors([{
    question_text: "Those children ___ playing in the field.",
    selected_answer: "have",correct_answer: "are",explanation: "Use are before playing.",
  }]), [{
    question: "Those children ___ playing in the field.",
    selected_answer: "have",correct_answer: "are",explanation: "Use are before playing.",
  }]);
});

test("AI remediation service persists only reviewed exact-taxonomy questions transactionally", async () => {
  const calls = [];
  let nextId = 100;
  const lineage = [
    { id: 44,parent_id: 33,node_type: "micro_skill",name: "-s/-es/-ies",description: "Rule",slug: "endings",legacy_skill: null,is_active: true },
    { id: 33,parent_id: 22,node_type: "subskill",name: "Third person",description: "Rule",slug: "third-person",legacy_skill: null,is_active: true },
    { id: 22,parent_id: 11,node_type: "topic",name: "Present Simple",description: "Rule",slug: "present-simple",legacy_skill: null,is_active: true },
    { id: 11,parent_id: null,node_type: "main_skill",name: "Grammar",description: "Grammar",slug: "grammar",legacy_skill: "grammar",is_active: true },
  ];
  const client = {
    async query(sql,params = []) {
      const compact = sql.replace(/\s+/g," ").trim();
      calls.push([compact,params]);
      if (compact.startsWith("WITH RECURSIVE lineage")) return { rows: lineage };
      if (compact.startsWith("SELECT DISTINCT q.*")) return { rows: [] };
      if (compact.startsWith("INSERT INTO questions")) {
        return { rows: [{ id: nextId++,question_text: params[0],option_a: params[1],option_b: params[2],
          option_c: params[3],option_d: params[4],correct_option: params[5],cefr_level: params[6],
          explanation: params[9],diagnostic_eligible: true }] };
      }
      return { rows: [] };
    },
    release() { calls.push(["release",[]]); },
  };
  const pool = { async connect() { return client; } };
  const aiService = {
    async generateRemediationExercises(payload) {
      assert.equal(payload.target.taxonomy_id,44);
      assert.equal(payload.requested_count,10);
      assert.equal(payload.target.rule_signature,reviewedRule.rule_signature);
      return { questions: Array.from({ length: 10 },(_, index) => candidate(index + 1)),
        used_ai: true,provider: "openai",model: "generator",review_model: "reviewer" };
    },
  };
  const service = createAiRemediationExerciseService({ pool,aiService,logger: { error() {} } });
  const saved = await service.ensureExercises({
    target: { taxonomy_id: 44,skill_name: "Selecting endings",taxonomy_description: "Use -s/-es/-ies",
      cefr_level: "A1",...reviewedRule },
  });

  assert.equal(saved.length,10);
  assert.equal(calls.filter(([sql]) => sql.startsWith("INSERT INTO questions")).length,10);
  assert.ok(calls.filter(([sql]) => sql.startsWith("INSERT INTO questions"))
    .every(([sql]) => sql.includes("'remediation'")));
  assert.equal(calls.filter(([sql]) => sql.startsWith("INSERT INTO question_ai_analysis")).length,10);
  assert.ok(calls.filter(([sql]) => sql.startsWith("INSERT INTO question_ai_analysis"))
    .every(([sql,params]) => sql.includes("rule_signature")
      && params.includes(reviewedRule.rule_signature)
      && params.includes(reviewedRule.rule_signature_version)));
  assert.ok(calls.some(([sql,params]) => sql.startsWith("SELECT DISTINCT q.*")
    && params[2] === reviewedRule.rule_signature
    && params[3] === reviewedRule.rule_signature_version));
  assert.equal(calls.filter(([sql]) => sql.startsWith("INSERT INTO question_taxonomy_tags")).length,40);
  assert.ok(calls.some(([sql]) => sql === "COMMIT"));
  assert.ok(calls.every(([,params]) => Array.isArray(params)));
});

test("broad taxonomy ignores its mixed stored bank and creates source-error exercises", async () => {
  const inserted = [];
  const existing = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,question_text: `Mixed grammar topic ${index + 1}`,
    option_a: "a",option_b: "b",option_c: "c",option_d: "d",correct_option: "A",
    explanation: "This belongs to an adjacent grammar topic.",diagnostic_eligible: true,
  }));
  const client = {
    async query(sql,params = []) {
      const compact = sql.replace(/\s+/g," ").trim();
      if (compact.startsWith("WITH RECURSIVE lineage")) return { rows: [
        { id: 17,parent_id: 9,node_type: "subskill",name: "Applying grammar rules",
          description: "Broad grammar",slug: "applying-grammar-rules",is_active: true },
        { id: 9,parent_id: 1,node_type: "topic",name: "General grammar",
          description: "Broad grammar",slug: "general-grammar",is_active: true },
        { id: 1,parent_id: null,node_type: "main_skill",name: "Grammar",
          description: "Grammar",slug: "grammar",legacy_skill: "grammar",is_active: true },
      ] };
      if (compact.startsWith("SELECT DISTINCT q.*")) return { rows: existing };
      if (compact.startsWith("INSERT INTO questions")) {
        inserted.push(params[0]);
        return { rows: [{ id: 100 + inserted.length,question_text: params[0],option_a: params[1],
          option_b: params[2],option_c: params[3],option_d: params[4],correct_option: params[5],
          cefr_level: params[6],explanation: params[9],diagnostic_eligible: true }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = createAiRemediationExerciseService({
    pool: { async connect() { return client; } },
    aiService: { async generateRemediationExercises(payload) {
      assert.equal(payload.learner_error_examples[0].question_text,"They ___ playing now.");
      return { questions: Array.from({ length: 10 },(_, index) => candidate(index + 20)),
        used_ai: true,provider: "openai",model: "generator",review_model: "reviewer" };
    } },
    logger: { error() {} },
  });
  const saved = await service.ensureExercises({
    target: { taxonomy_id: 17,skill_name: "Applying grammar rules",cefr_level: "A1" },
    learnerErrors: [{ question_text: "They ___ playing now.",selected_answer: "have",correct_answer: "are" }],
    reuseExistingQuestions: false,
  });
  assert.equal(saved.length,10);
  assert.equal(inserted.length,10);
});

test("AI remediation service persists a reviewed partial batch for a later safe top-up", async () => {
  let connected = false;
  let inserted = 0;
  const lineage = [
    { id: 44,parent_id: 33,node_type: "micro_skill",name: "-s",slug: "endings",legacy_skill: null,is_active: true },
    { id: 33,parent_id: 22,node_type: "subskill",name: "Third person",slug: "third-person",legacy_skill: null,is_active: true },
    { id: 22,parent_id: 11,node_type: "topic",name: "Present Simple",slug: "present-simple",legacy_skill: null,is_active: true },
    { id: 11,parent_id: null,node_type: "main_skill",name: "Grammar",slug: "grammar",legacy_skill: "grammar",is_active: true },
  ];
  const client = {
    async query(sql,params = []) {
      const compact = sql.replace(/\s+/g," ").trim();
      if (compact.startsWith("WITH RECURSIVE lineage")) return { rows: lineage };
      if (compact.startsWith("SELECT DISTINCT q.*")) return { rows: [] };
      if (compact.startsWith("INSERT INTO questions")) {
        inserted++;
        return { rows: [{ id: 200 + inserted,question_text: params[0],option_a: params[1],option_b: params[2],
          option_c: params[3],option_d: params[4],correct_option: params[5],cefr_level: params[6],
          explanation: params[9],diagnostic_eligible: true }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = createAiRemediationExerciseService({
    pool: { async connect() { connected = true; return client; } },
    aiService: { async generateRemediationExercises() {
      return { questions: Array.from({ length: 9 },(_, index) => candidate(index + 1)) };
    } },
    logger: { error() {} },
  });
  const saved = await service.ensureExercises({
    target: { taxonomy_id: 44,skill_name: "Rule",cefr_level: "A1",...reviewedRule },
  });
  assert.equal(saved.length,9);
  assert.equal(inserted,9);
  assert.equal(connected,true);
});
