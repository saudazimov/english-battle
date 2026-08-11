const VALID_OPTIONS = new Set(["A", "B", "C", "D"]);
const {
  learningTextContainsPhrase,
  learningTextDuplicateIndexes,
  selectBalancedCorrectOptions,
} = require("../utils/learningContentSimilarity");
const VALID_TYPES = new Set(["gap_fill", "multiple_choice", "error_correction"]);
const TAG_ROLES = new Set(["main_skill", "topic", "subskill", "micro_skill"]);
const NATURAL_DO_OBJECT_PATTERN = /\b(homework|housework|chores?|work|jobs?|best|exercises?|tasks?|dut(?:y|ies)|assignments?|projects?|research|practice|shopping|cleaning|washing|dishes|laundry)\b/;
const CONSERVATIVE_LESSON_DO_OBJECT_PATTERN = /\b(homework|housework|chores?|work|jobs?|best|exercises?|tasks?|dut(?:y|ies)|assignments?|research|practice|shopping|cleaning|washing|dishes|laundry)\b/;
const CONSERVATIVE_LESSON_DO_SUBJECT_PATTERN = /^(?:he|she|(?:my|your|his|her|our|their|the)\s+(?:brother|sister|mother|father|friend|teacher|student|boy|girl|man|woman|child|son|daughter|worker))\b/;
const DO_LESSON_OBJECT_PHRASE_PATTERN = /^(?:(?:his|her|the)\s+)?(?:homework|housework|chores?|work|exercises?|tasks?|dut(?:y|ies)|assignments?|research|practice|shopping|cleaning|washing|dishes|laundry)\b|^a\s+(?:great\s+)?job\b|^(?:his|her)\s+best\b/;
const DETERMINISTIC_LESSON_SIGNATURES = new Set([
  "grammar.present_simple.to_be_affirmative.first_person_singular_i_am",
  "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s",
  "grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies",
  "grammar.present_simple.third_person_singular_affirmative.vowel_y_add_s",
  "grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es",
  "grammar.present_simple.third_person_singular_affirmative.verb_ending_ch_add_es",
  "grammar.present_simple.third_person_singular_affirmative.verb_ending_sh_add_es",
  "grammar.present_simple.third_person_singular_affirmative.do_to_does",
  "grammar.past_simple.affirmative.regular_verb_ed",
]);

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedStem(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function hasValidQuestionPrompt(value, questionType = "multiple_choice") {
  const prompt = text(value, 1000);
  if (prompt.length < 8 || /[\r\n\t]/.test(prompt)) return false;
  const blankMatches = prompt.match(/___/g) || [];
  const hasAnyUnderscore = prompt.includes("_");
  if (questionType === "gap_fill" && blankMatches.length !== 1) return false;
  if (!hasAnyUnderscore) return questionType !== "gap_fill";
  if (blankMatches.length !== 1 || prompt.replace("___", "").includes("_")) return false;
  const blankIndex = prompt.indexOf("___");
  const before = prompt[blankIndex - 1] || "";
  const after = prompt[blankIndex + 3] || "";
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
}

function optionAnswer(question) {
  return text(question && question.options && question.options[question.correct_option], 255).toLowerCase();
}

function explanationMatchesCorrectAnswer(question) {
  return learningTextContainsPhrase(question && question.explanation,optionAnswer(question));
}

function distractorAnswers(question) {
  return ["A","B","C","D"]
    .filter((key) => key !== question.correct_option)
    .map((key) => text(question.options && question.options[key],255).toLowerCase())
    .filter(Boolean);
}

function isAffirmativeThirdPersonPrompt(stem) {
  return !/\bnot\b/.test(stem) && !/n't\b/.test(stem) && !/\?/.test(stem)
    && !/\b(?:i|we|you|they)\s+_{2,}/.test(stem);
}

function hasPastSimpleContext(stem) {
  return /\b(?:yesterday|last\s+(?:night|week|weekend|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:days?|weeks?|months?|years?)\s+ago)\b/.test(stem);
}

function isFirstPersonSingularIAmPrompt(stem) {
  const match = stem.match(/\bi\s+_{2,}\s+([a-z'-]+)/);
  return Boolean(match)
    && !/\bnot\b/.test(stem)
    && !/n't\b/.test(stem)
    && !/\?/.test(stem)
    && !/ing$/.test(match[1]);
}

function isRegularThirdPersonBase(base) {
  if (!/^[a-z]+$/.test(base)) return false;
  if (["be","have","can","could","may","might","must","shall","should","will","would"].includes(base)) {
    return false;
  }
  return !/(?:s|sh|ch|x|z|o)$/.test(base)
    && !/[bcdfghjklmnpqrstvwxyz]y$/.test(base);
}

const IRREGULAR_PAST_BASES = new Set([
  "be","become","begin","break","bring","build","buy","catch","choose","come","cost","cut","do","draw","drink","drive",
  "eat","fall","feel","find","fly","forget","get","give","go","grow","have","hear","keep","know","leave","lose","make",
  "meet","pay","put","read","ride","run","say","see","sell","send","sing","sit","sleep","speak","spend","stand","swim",
  "take","teach","tell","think","throw","understand","wake","wear","win","write",
]);
const DOUBLED_PAST_BASES = new Set([
  "admit","beg","chat","clap","drag","drop","fit","grab","hop","hug","jog","nod","occur","permit","plan","prefer","rob",
  "shop","skip","slip","stop","travel",
]);
function isSimpleRegularPastBase(value) {
  const base = text(value,80).toLowerCase();
  return /^[a-z]+$/.test(base)
    && !base.endsWith("e")
    && !/[bcdfghjklmnpqrstvwxyz]y$/.test(base)
    && !IRREGULAR_PAST_BASES.has(base)
    && !DOUBLED_PAST_BASES.has(base);
}

function contractWords(value) {
  return text(value,1000).normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
}

function contractHasWords(value,required) {
  const words = new Set(contractWords(value));
  return required.every((word) => words.has(word));
}

function contractHasAnyPhrase(value,phrases) {
  return phrases.some((phrase) => contractHasWords(value,phrase));
}

function canonicalContractMorphology(signature,base,targetForm) {
  if (signature === "grammar.present_simple.to_be_affirmative.first_person_singular_i_am") {
    return base === "be" && targetForm === "am";
  }
  if (signature.endsWith(".regular_verb_add_s")) {
    return isRegularThirdPersonBase(base) && targetForm === `${base}s`;
  }
  if (signature.endsWith(".consonant_y_to_ies")) {
    return /[bcdfghjklmnpqrstvwxyz]y$/.test(base)
      && targetForm === `${base.slice(0,-1)}ies`;
  }
  if (signature.endsWith(".vowel_y_add_s")) {
    return /[aeiou]y$/.test(base) && targetForm === `${base}s`;
  }
  if (signature.endsWith(".verb_ending_o_add_es")) {
    return base !== "do" && /o$/.test(base) && targetForm === `${base}es`;
  }
  if (signature.endsWith(".verb_ending_ch_add_es")) {
    return /ch$/.test(base) && targetForm === `${base}es`;
  }
  if (signature.endsWith(".verb_ending_sh_add_es")) {
    return /sh$/.test(base) && targetForm === `${base}es`;
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.do_to_does") {
    return base === "do" && targetForm === "does";
  }
  if (signature === "grammar.past_simple.affirmative.regular_verb_ed") {
    return isSimpleRegularPastBase(base) && targetForm === `${base}ed`;
  }
  return false;
}

function deterministicRuleContractReview(contract,target) {
  const signature = text(target && target.rule_signature,255);
  if (!DETERMINISTIC_LESSON_SIGNATURES.has(signature)) {
    return { supported: false,approved: false,failed_fields: [] };
  }
  const source = contract && contract.source_construction || {};
  const base = contractWords(source.base_form).join(" ");
  const targetForm = contractWords(source.target_form).join(" ");
  const failed = [];
  if (!contract || contract.canonical_rule_signature !== signature) failed.push("signature");
  const tenseWords = signature.startsWith("grammar.present_simple.")
    ? ["present","simple"] : ["past","simple"];
  if (!contractHasWords(source.tense,tenseWords)) failed.push("tense");
  if (!contractHasWords(source.polarity,["affirmative"])) failed.push("polarity");
  if (!contractHasAnyPhrase(source.clause_type,[["declarative"],["statement"],["main","clause"]])) {
    failed.push("clause_type");
  }
  if (signature.includes(".third_person_singular_affirmative.")
      && !contractHasWords(source.subject_constraint,["third","person","singular"])) {
    failed.push("subject_constraint");
  }
  if (signature.includes(".first_person_singular_i_am")
      && !contractHasAnyPhrase(source.subject_constraint,[["first","person","singular"],["i"]])) {
    failed.push("subject_constraint");
  }
  const copular = signature.includes(".first_person_singular_i_am");
  const validFunction = copular
    ? contractHasAnyPhrase(source.grammatical_function,[["copula"],["copular"],["linking","verb"]])
    : contractHasAnyPhrase(source.grammatical_function,[["lexical"],["main","verb"]]);
  if (!validFunction) failed.push("grammatical_function");
  if (!canonicalContractMorphology(signature,base,targetForm)) failed.push("base_target_form");
  if (!contractHasWords(contract && contract.required_transformation,[base,targetForm])) {
    failed.push("required_transformation");
  }
  if (!contractHasWords(contract && contract.minimal_pair && contract.minimal_pair.invalid,[base])
      || !contractHasWords(contract && contract.minimal_pair && contract.minimal_pair.valid,[targetForm])) {
    failed.push("minimal_pair");
  }
  return { supported: true,approved: failed.length === 0,failed_fields: [...new Set(failed)] };
}

function morphologyMatchesCanonicalRule(question, signature) {
  const correct = optionAnswer(question);
  const bases = distractorAnswers(question);
  if (signature === "grammar.present_simple.to_be_affirmative.first_person_singular_i_am") {
    const values = ["A","B","C","D"]
      .map((key) => text(question.options && question.options[key],255).toLowerCase());
    return correct === "am" && new Set(values).size === 4
      && ["am","is","are","be"].every((value) => values.includes(value));
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.regular_verb_add_s") {
    return bases.some((base) => isRegularThirdPersonBase(base) && correct === `${base}s`);
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.consonant_y_to_ies") {
    const values = ["A","B","C","D"].map((key) => text(question.options && question.options[key],255).toLowerCase());
    if (values.some((value) => /ieses$/.test(value) || /[bcdfghjklmnpqrstvwxyz]ie$/.test(value))) return false;
    return bases.some((base) => /[bcdfghjklmnpqrstvwxyz]y$/.test(base)
      && correct === `${base.slice(0,-1)}ies`);
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.vowel_y_add_s") {
    const values = ["A","B","C","D"].map((key) => text(question.options && question.options[key],255).toLowerCase());
    if (values.some((value) => /yses$/.test(value))) return false;
    return bases.some((base) => /[aeiou]y$/.test(base) && correct === `${base}s`);
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.verb_ending_o_add_es") {
    return bases.some((base) => /o$/.test(base) && correct === `${base}es`);
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.verb_ending_ch_add_es") {
    const values = ["A","B","C","D"].map((key) => text(question.options && question.options[key],255).toLowerCase());
    if (values.some((value) => /cheses$/.test(value))) return false;
    return bases.some((base) => /ch$/.test(base) && correct === `${base}es`);
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.verb_ending_sh_add_es") {
    const values = ["A","B","C","D"].map((key) => text(question.options && question.options[key],255).toLowerCase());
    if (values.some((value) => /sheses$/.test(value))) return false;
    return bases.some((base) => /sh$/.test(base) && correct === `${base}es`);
  }
  if (signature === "grammar.past_simple.affirmative.regular_verb_ed") {
    const values = ["A","B","C","D"].map((key) => text(question.options && question.options[key],255).toLowerCase());
    if (values.some((value) => /eded$/.test(value))) return false;
    return bases.some((base) => isSimpleRegularPastBase(base) && correct === `${base}ed`);
  }
  return true;
}

function validCandidateForRule(question, target) {
  const signature = text(target && target.rule_signature, 255);
  const stem = normalizedStem(question && question.question_text);
  if (signature === "grammar.present_simple.to_be_affirmative.first_person_singular_i_am"
      && !isFirstPersonSingularIAmPrompt(stem)) return false;
  if (signature.includes(".third_person_singular_affirmative.")
      && !isAffirmativeThirdPersonPrompt(stem)) return false;
  if (signature === "grammar.past_simple.affirmative.regular_verb_ed"
      && !hasPastSimpleContext(stem)) return false;
  if (signature === "grammar.present_simple.third_person_singular_affirmative.do_to_does") {
    const answer = optionAnswer(question);
    return answer === "does" && NATURAL_DO_OBJECT_PATTERN.test(stem);
  }
  return morphologyMatchesCanonicalRule(question,signature);
}

function canonicalRuleTeachingConstraints(target) {
  const signature = text(target && target.rule_signature,255);
  const constraints = [
    `Use only the exact canonical rule: ${signature || "the supplied source-error rule"}.`,
    "Mirror the source error's tense, polarity, clause type, and grammatical function in every example.",
  ];
  if (signature === "grammar.present_simple.third_person_singular_affirmative.do_to_does") {
    constraints.push(
      "Use does only as the affirmative lexical main verb followed by a natural noun object.",
      "Use conservative common do-collocations only: homework, housework, chores, work, a job, one's best, exercises, tasks, duties, assignments, research, practice, shopping, cleaning, washing, dishes, or laundry.",
      "Use a natural human third-person singular subject such as he, she, my sister, or the student; never use it for human chores or study tasks.",
      "Never use does not, does + base verb, emphatic does, or question-auxiliary does."
    );
  } else if (signature === "grammar.present_simple.to_be_affirmative.first_person_singular_i_am") {
    constraints.push("Every example must begin with the exact affirmative copular pattern I am followed by a simple state, identity, age, nationality, or location complement; never use am + verb-ing, a negative, a question, or a passive.");
  } else if (signature.endsWith(".consonant_y_to_ies")) {
    constraints.push("Use a simple third-person singular subject immediately followed by a verb whose base ends in consonant + y and changes y to ies.");
  } else if (signature.endsWith(".vowel_y_add_s")) {
    constraints.push("Use a simple third-person singular subject immediately followed by a verb whose base ends in vowel + y and keeps y before adding s.");
  } else if (signature.endsWith(".regular_verb_add_s")) {
    constraints.push("Use a simple third-person singular subject immediately followed by a regular eligible verb whose exact transformation is base + s.");
  } else if (signature.endsWith(".verb_ending_o_add_es")) {
    constraints.push("Use a simple third-person singular subject immediately followed by a base verb ending in o whose target form is base + es; do→does belongs to another rule and is forbidden here.");
  } else if (signature.endsWith(".verb_ending_ch_add_es")) {
    constraints.push("Use a simple third-person singular subject immediately followed by a base verb ending in ch whose target form is base + es.");
  } else if (signature.endsWith(".verb_ending_sh_add_es")) {
    constraints.push("Use a simple third-person singular subject immediately followed by a base verb ending in sh whose target form is base + es.");
  } else if (signature === "grammar.past_simple.affirmative.regular_verb_ed") {
    constraints.push("Use a simple subject immediately followed by a regular past verb whose exact transformation is base + ed; exclude final-e, consonant-y, doubled-consonant, and irregular forms.");
  }
  return constraints;
}

function simpleSurfaceVerb(example, thirdPersonOnly) {
  const pronouns = thirdPersonOnly ? "he|she|it" : "i|you|we|they|he|she|it";
  const pattern = new RegExp(`^(?:${pronouns}|(?:my|your|his|her|our|their|the|a|an)\\s+[a-z'-]+)\\s+([a-z'-]+)\\b`);
  const match = example.match(pattern);
  return match ? match[1] : "";
}

function nonAdjacentAffirmativeExample(sentence, presentSimple) {
  const example = text(sentence,1000).toLowerCase();
  if (!example || example.includes("?") || /\bnot\b|n't\b/.test(example)) return "";
  if (presentSimple && /\b(yesterday|last\s+(?:night|week|month|year)|ago|tomorrow|right now|at the moment)\b/.test(example)) {
    return "";
  }
  return example;
}

function lessonExampleMatchesCanonicalRule(sentence,target) {
  const signature = text(target && target.rule_signature,255);
  if (!DETERMINISTIC_LESSON_SIGNATURES.has(signature)) return true;
  const presentSimple = signature.startsWith("grammar.present_simple.");
  const example = nonAdjacentAffirmativeExample(sentence,presentSimple);
  if (!example) return false;
  if (signature === "grammar.present_simple.to_be_affirmative.first_person_singular_i_am") {
    const complement = example.match(/^i\s+am\s+([a-z'-]+)/);
    return Boolean(complement) && !/ing$/.test(complement[1]) && complement[1] !== "being";
  }
  if (signature === "grammar.present_simple.third_person_singular_affirmative.do_to_does") {
    const objectPhrase = example.match(/\bdoes\s+(.+)$/);
    return CONSERVATIVE_LESSON_DO_OBJECT_PATTERN.test(example)
      && CONSERVATIVE_LESSON_DO_SUBJECT_PATTERN.test(example)
      && Boolean(objectPhrase && DO_LESSON_OBJECT_PHRASE_PATTERN.test(objectPhrase[1]));
  }
  const verb = simpleSurfaceVerb(example,presentSimple);
  if (!verb) return false;
  if (signature.endsWith(".regular_verb_add_s")) {
    if (/(?:ies|oes|ches|shes|xes|sses|zzes)$/.test(verb)) return false;
    const base = verb.endsWith("s") ? verb.slice(0,-1) : "";
    return Boolean(base) && isRegularThirdPersonBase(base) && verb === `${base}s`;
  }
  if (signature.endsWith(".consonant_y_to_ies")) {
    const base = verb.endsWith("ies") ? `${verb.slice(0,-3)}y` : "";
    return /[bcdfghjklmnpqrstvwxyz]y$/.test(base);
  }
  if (signature.endsWith(".vowel_y_add_s")) {
    const base = verb.endsWith("s") ? verb.slice(0,-1) : "";
    return /[aeiou]y$/.test(base) && verb === `${base}s`;
  }
  if (signature.endsWith(".verb_ending_o_add_es")) {
    const base = verb.endsWith("es") ? verb.slice(0,-2) : "";
    return base !== "do" && /o$/.test(base) && verb === `${base}es`;
  }
  if (signature.endsWith(".verb_ending_ch_add_es")) {
    const base = verb.endsWith("es") ? verb.slice(0,-2) : "";
    return /ch$/.test(base) && verb === `${base}es`;
  }
  if (signature.endsWith(".verb_ending_sh_add_es")) {
    const base = verb.endsWith("es") ? verb.slice(0,-2) : "";
    return /sh$/.test(base) && verb === `${base}es`;
  }
  if (signature === "grammar.past_simple.affirmative.regular_verb_ed") {
    if (/(?:ied|([bcdfghjklmnpqrstvwxyz])\1ed)$/.test(verb)) return false;
    const base = verb.endsWith("ed") ? verb.slice(0,-2) : "";
    return isSimpleRegularPastBase(base) && verb === `${base}ed`;
  }
  return false;
}

function lessonExampleTargetForm(sentence,target) {
  const signature = text(target && target.rule_signature,255);
  if (!DETERMINISTIC_LESSON_SIGNATURES.has(signature)
      || !lessonExampleMatchesCanonicalRule(sentence,target)) return "";
  if (signature === "grammar.present_simple.to_be_affirmative.first_person_singular_i_am") return "am";
  if (signature === "grammar.present_simple.third_person_singular_affirmative.do_to_does") return "does";
  const example = text(sentence,1000).toLowerCase();
  return simpleSurfaceVerb(example,signature.startsWith("grammar.present_simple."));
}

function deterministicLessonExampleReview(examples,target) {
  const signature = text(target && target.rule_signature,255);
  if (!DETERMINISTIC_LESSON_SIGNATURES.has(signature)) {
    return { supported: false,approved: false,failed_indexes: [] };
  }
  if (!Array.isArray(examples) || examples.length !== 10) {
    return { supported: true,approved: false,failed_indexes: [] };
  }
  const failedIndexes = examples.flatMap((example,index) => (
    lessonExampleMatchesCanonicalRule(example && example.sentence,target) ? [] : [index]
  ));
  return { supported: true,approved: failedIndexes.length === 0,failed_indexes: failedIndexes };
}

function canonicalizeRuleContract(contract,target) {
  if (!contract || typeof contract !== "object") return contract;
  const signature = text(target && target.rule_signature,255);
  if (signature !== "grammar.present_simple.third_person_singular_affirmative.do_to_does") {
    return contract;
  }
  const humanSubject = "A natural human third-person singular subject such as he, she, my sister, or the student";
  const allowedObjects = "homework, housework, chores, work, a job, one's best, exercises, tasks, duties, assignments, research, practice, shopping, cleaning, washing, dishes, or laundry";
  return {
    ...contract,
    source_construction: {
      ...contract.source_construction,
      complement_pattern: `does followed by a natural noun object from this allow-list: ${allowedObjects}`,
    },
    eligibility_conditions: [
      humanSubject,
      "Affirmative present simple lexical main-verb use only",
    ],
    required_patterns: [
      `${humanSubject} + does + one natural noun object from this allow-list: ${allowedObjects}`,
    ],
  };
}

function validCandidate(question, target = null) {
  const options = question && question.options;
  const values = options && ["A", "B", "C", "D"].map((key) => text(options[key], 255));
  return Boolean(question)
    && VALID_TYPES.has(question.question_type)
    && hasValidQuestionPrompt(question.question_text, question.question_type)
    && VALID_OPTIONS.has(question.correct_option)
    && Array.isArray(values) && values.every(Boolean)
    && values.every((value) => !value.includes("_"))
    && new Set(values.map((value) => value.toLowerCase())).size === 4
    && text(question.explanation, 1200).length >= 8
    && explanationMatchesCorrectAnswer(question)
    && Number(question.review_confidence) >= 0.9
    && validCandidateForRule(question, target);
}

function validStoredQuestion(question) {
  const values = [question.option_a,question.option_b,question.option_c,question.option_d]
    .map((value) => text(value,255));
  const correctIndex = VALID_OPTIONS.has(text(question.correct_option,1).toUpperCase())
    ? text(question.correct_option,1).toUpperCase().charCodeAt(0) - 65 : -1;
  return hasValidQuestionPrompt(question.question_text,question.question_type || "multiple_choice")
    && VALID_OPTIONS.has(text(question.correct_option,1).toUpperCase())
    && values.every(Boolean) && values.every((value) => !value.includes("_"))
    && new Set(values.map((value) => value.toLowerCase())).size === 4
    && text(question.explanation,1200).length >= 8
    && correctIndex >= 0
    && learningTextContainsPhrase(question.explanation,values[correctIndex]);
}

function difficultyFor(level) {
  if (["Pre-A1", "A1", "A2"].includes(level)) return "easy";
  if (["B1", "B2"].includes(level)) return "medium";
  return "hard";
}

async function loadLineage(client, taxonomyId) {
  const result = await client.query(
    `WITH RECURSIVE lineage AS (
       SELECT id,parent_id,node_type,name,description,slug,legacy_skill,is_active
       FROM learning_taxonomy WHERE id=$1
       UNION ALL
       SELECT t.id,t.parent_id,t.node_type,t.name,t.description,t.slug,t.legacy_skill,t.is_active
       FROM learning_taxonomy t JOIN lineage l ON l.parent_id=t.id
     ) SELECT * FROM lineage`,
    [taxonomyId]
  );
  if (!result.rows.length || result.rows.some((node) => !node.is_active)) return null;
  const roles = Object.fromEntries(result.rows.map((node) => [node.node_type, node]));
  return { nodes: result.rows.filter((node) => TAG_ROLES.has(node.node_type)), roles };
}

async function loadExisting(client, taxonomyId, cefrLevel, ruleScope = null) {
  return client.query(
    `SELECT DISTINCT q.*,qa.question_type
     FROM question_taxonomy_tags qt
     JOIN questions q ON q.id=qt.question_id
     JOIN question_ai_analysis qa ON qa.question_id=q.id
     WHERE qt.taxonomy_id=$1 AND q.cefr_level=$2
       AND q.diagnostic_eligible=true AND qa.diagnostic_eligible=true
       AND ($3::varchar IS NULL OR (
         qa.rule_signature=$3 AND qa.rule_signature_version=$4
         AND qa.rule_signature_reviewed=true AND qa.rule_signature_confidence>=0.9
       ))
       AND (q.status IS NULL OR q.status IN ('active','published','remediation'))`,
    [taxonomyId, cefrLevel, ruleScope?.key || null, ruleScope?.version || null]
  );
}

function exactRuleScope(target) {
  const signature = text(target && target.rule_signature, 255);
  const version = text(target && target.rule_signature_version, 80);
  const confidence = Number(target && target.rule_signature_confidence);
  return target && target.rule_signature_reviewed === true
    && version === "canonical_rule_signature_v1"
    && Number.isFinite(confidence) && confidence >= 0.9
    && signature
    ? { key: signature, version }
    : null;
}

async function insertAnalysis(client, questionId, target, lineage, generated, metadata) {
  const confidence = Number(generated.review_confidence);
  const role = lineage.roles;
  await client.query(
    `INSERT INTO question_ai_analysis (
       question_id,schema_version,prompt_version,analysis_version,status,estimated_level,
       level_confidence,level_evidence,main_skill_id,topic_id,subskill_id,micro_skill_id,
       taxonomy_confidence,question_type,cognitive_task,grammar_structure,required_vocabulary,
       prerequisite_skill_ids,correct_answer_explanation,quality_warnings,diagnostic_eligible,
       contains_above_level_language,analysis_confidence,provider,model,raw_analysis,analyzed_at,
       rule_signature,rule_signature_version,rule_signature_confidence,rule_signature_reviewed
     ) VALUES ($1,'question_analysis_v1','remediation_exercise_prompt_v2',1,'READY',$2,$3,$4::jsonb,
       $5,$6,$7,$8,$3,$9,'select_correct_option',$10,'[]'::jsonb,'[]'::jsonb,$11,'[]'::jsonb,
       true,false,$3,$12,$13,$14::jsonb,NOW(),$15,$16,$3,true)`,
    [questionId,target.cefr_level,confidence,JSON.stringify(["Independent AI review passed."]),
      role.main_skill?.id || null,role.topic?.id || null,role.subskill?.id || null,
      role.micro_skill?.id || null,generated.question_type,target.name,generated.explanation,
      metadata.provider,metadata.model,JSON.stringify({ source: "ai_remediation_generation",
        target_taxonomy_id: Number(target.taxonomy_id), review_model: metadata.review_model }),
      target.rule_signature,target.rule_signature_version]
  );
  for (const node of lineage.nodes) {
    await client.query(
      `INSERT INTO question_taxonomy_tags (question_id,taxonomy_id,tag_role,confidence,source)
       VALUES ($1,$2,$3,$4,'ai') ON CONFLICT DO NOTHING`,
      [questionId,node.id,node.node_type,confidence]
    );
  }
}

async function insertCandidate(client, target, lineage, generated, metadata) {
  const options = generated.options;
  const main = lineage.roles.main_skill;
  const saved = await client.query(
    `INSERT INTO questions (
       question_text,option_a,option_b,option_c,option_d,correct_option,cefr_level,skill,
       difficulty,explanation,status,analysis_status,diagnostic_eligible,analysis_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'remediation','READY',true,1) RETURNING *`,
    [text(generated.question_text),text(options.A,255),text(options.B,255),text(options.C,255),
      text(options.D,255),generated.correct_option,target.cefr_level,
      main?.legacy_skill || main?.slug || "grammar",difficultyFor(target.cefr_level),
      text(generated.explanation,1200)]
  );
  await insertAnalysis(client,saved.rows[0].id,target,lineage,generated,metadata);
  return { ...saved.rows[0], question_type: generated.question_type };
}

function createAiRemediationExerciseService({ pool, aiService, logger = console }) {
  async function persist(target, candidates, desiredCount, metadata, reuseExistingQuestions) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ai-remediation:${target.taxonomy_id}`]);
      const lineage = await loadLineage(client,target.taxonomy_id);
      if (!lineage) throw new Error("Active remediation taxonomy lineage not found");
      const ruleScope = exactRuleScope(target);
      if (reuseExistingQuestions && !ruleScope) {
        throw new Error("Reviewed canonical rule is required for shared remediation questions");
      }
      const existing = await loadExisting(client,target.taxonomy_id,target.cefr_level,ruleScope);
      const stems = new Set(existing.rows.map((question) => normalizedStem(question.question_text)));
      const approvedExisting = reuseExistingQuestions
        ? existing.rows.filter(validStoredQuestion).slice(0,Number(desiredCount)) : [];
      const approvedCount = approvedExisting.length;
      const needed = Math.max(0, Number(desiredCount) - approvedCount);
      const eligible = [];
      const comparisonStems = existing.rows.map((question) => question.question_text);
      const comparisonExplanations = existing.rows.map((question) => question.explanation);
      for (const candidate of candidates) {
        const stem = normalizedStem(candidate.question_text);
        if (!validCandidate(candidate,target) || stems.has(stem)) continue;
        const compared = [...comparisonStems,...eligible.map((item) => item.question_text),candidate.question_text];
        if (learningTextDuplicateIndexes(compared).includes(compared.length - 1)) continue;
        const explanations = [
          ...comparisonExplanations,
          ...eligible.map((item) => item.explanation),
          candidate.explanation,
        ];
        if (learningTextDuplicateIndexes(explanations).includes(explanations.length - 1)) continue;
        eligible.push(candidate);
        stems.add(stem);
      }
      const saveCount = Math.min(needed,eligible.length);
      const selected = selectBalancedCorrectOptions(eligible,saveCount,approvedExisting);
      const saved = [];
      for (const candidate of selected) {
        saved.push(await insertCandidate(client,target,lineage,candidate,metadata));
      }
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function ensureExercises({
    target, existingQuestions = [], learnerErrors = [], desiredCount = 10,
    reuseExistingQuestions = true,
  }) {
    if (!aiService || typeof aiService.generateRemediationExercises !== "function") return [];
    const missing = Math.max(0, Number(desiredCount) - existingQuestions.length);
    if (!missing) return [];
    try {
      const generated = await aiService.generateRemediationExercises({
        target: {
          taxonomy_id: Number(target.taxonomy_id), name: target.skill_name,
          description: target.taxonomy_description, cefr_level: target.cefr_level,
          rule_signature: target.rule_signature,
          rule_signature_version: target.rule_signature_version,
        },
        requested_count: missing,
        blocked_question_stems: existingQuestions.map((question) => question.question_text),
        learner_error_examples: learnerErrors,
      });
      if (!generated || !Array.isArray(generated.questions) || generated.questions.length === 0) return [];
      return persist(target,generated.questions,desiredCount,generated,reuseExistingQuestions);
    } catch (error) {
      logger.error("AI remediation exercise persistence xatosi:", error.message);
      return [];
    }
  }

  return { ensureExercises };
}

module.exports = {
  normalizedStem,hasValidQuestionPrompt,isAffirmativeThirdPersonPrompt,hasPastSimpleContext,isFirstPersonSingularIAmPrompt,isRegularThirdPersonBase,isSimpleRegularPastBase,morphologyMatchesCanonicalRule,
  validCandidateForRule,canonicalRuleTeachingConstraints,lessonExampleMatchesCanonicalRule,
  lessonExampleTargetForm,
  deterministicLessonExampleReview,deterministicRuleContractReview,canonicalizeRuleContract,
  validCandidate,validStoredQuestion,exactRuleScope,
  createAiRemediationExerciseService,
};
