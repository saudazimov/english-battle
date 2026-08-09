const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { fallbackLesson } = require("./personalizedLessonService");

const DEMO_VERSION = "learning-diagnostics-v1";
const DEMO_MARKER = `[DEMO:${DEMO_VERSION}]`;
const DEMO_USERNAME_PREFIX = "demo_diag_";
const DEMO_CLASS_CODE = "DIAGV1";
const DEFAULT_DEMO_PASSWORD = "DemoLearning!2026";

const DEMO_CASES = Object.freeze([
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

const TIMELINE_OFFSETS = Object.freeze({
  originalErrors: -20,
  lesson: -14,
  retest: -13,
  review1: -12,
  review3: -10,
  review7: -6,
  review21: 7,
  regression: -1,
});

const DEMO_STUDENTS = Object.freeze([
  {
    key: "present_simple",
    username: `${DEMO_USERNAME_PREFIX}present`,
    phone: "+998990000091",
    firstName: "Malika",
    lastName: "Qodirova",
    leafSlug: "selecting-s-es-ies",
    classification: "MISCONCEPTION",
    state: "CONFIRMED",
    mastery: 31,
    confidence: 78,
    priority: 92,
    errorCount: 5,
    correctCount: 1,
  },
  {
    key: "careless_timed",
    username: `${DEMO_USERNAME_PREFIX}timed`,
    phone: "+998990000092",
    firstName: "Temur",
    lastName: "Saidov",
    leafSlug: "applying-grammar-rules",
    classification: "CARELESS_ERROR",
    state: "LIKELY",
    mastery: 58,
    confidence: 70,
    priority: 73,
    errorCount: 4,
    correctCount: 4,
  },
  {
    key: "vocabulary",
    username: `${DEMO_USERNAME_PREFIX}vocab`,
    phone: "+998990000093",
    firstName: "Aziza",
    lastName: "Rahimova",
    leafSlug: "inferring-word-meaning",
    classification: "VOCABULARY_GAP",
    state: "CONFIRMED",
    mastery: 38,
    confidence: 74,
    priority: 86,
    errorCount: 5,
    correctCount: 2,
  },
  {
    key: "reading",
    username: `${DEMO_USERNAME_PREFIX}reading`,
    phone: "+998990000094",
    firstName: "Sardor",
    lastName: "Karimov",
    leafSlug: "understanding-paraphrase",
    classification: "READING_COMPREHENSION_GAP",
    state: "CONFIRMED",
    mastery: 35,
    confidence: 75,
    priority: 88,
    errorCount: 5,
    correctCount: 2,
  },
  {
    key: "improved",
    username: `${DEMO_USERNAME_PREFIX}improved`,
    phone: "+998990000095",
    firstName: "Laylo",
    lastName: "Usmonova",
    leafSlug: "selecting-s-es-ies",
    classification: "MISCONCEPTION",
    state: "MASTERED",
    mastery: 91,
    confidence: 88,
    priority: 8,
    errorCount: 4,
    correctCount: 3,
    remediation: "mastered",
  },
  {
    key: "regressed",
    username: `${DEMO_USERNAME_PREFIX}regressed`,
    phone: "+998990000096",
    firstName: "Javohir",
    lastName: "Ergashev",
    leafSlug: "selecting-s-es-ies",
    classification: "MISCONCEPTION",
    state: "REGRESSED",
    mastery: 49,
    confidence: 90,
    priority: 96,
    errorCount: 6,
    correctCount: 3,
    remediation: "regressed",
  },
]);

const PRESENT_SIMPLE_QUESTIONS = Object.freeze([
  ["He ___ to school every day.", "goes", "go", "going", "went"],
  ["My sister ___ English after class.", "studies", "study", "studying", "studied"],
  ["The bus ___ at seven o'clock.", "leaves", "leave", "leaving", "left"],
  ["She ___ her homework in the evening.", "does", "do", "doing", "did"],
  ["Ali ___ football on Fridays.", "plays", "play", "playing", "played"],
  ["The baby ___ when it is hungry.", "cries", "cry", "crying", "cried"],
  ["Our teacher ___ every answer.", "checks", "check", "checking", "checked"],
  ["He ___ TV after dinner.", "watches", "watch", "watching", "watched"],
  ["Madina ___ the dishes at home.", "washes", "wash", "washing", "washed"],
  ["The shop ___ at nine in the morning.", "opens", "open", "opening", "opened"],
]);

const QUESTION_GROUPS = Object.freeze({
  present_simple: PRESENT_SIMPLE_QUESTIONS.map((entry, index) => ({
    key: `present-${index + 1}`,
    text: entry[0],
    options: entry.slice(1),
    correctOption: "A",
    leafSlug: "selecting-s-es-ies",
    legacySkill: "grammar",
    format: index % 2 === 0 ? "gap_fill" : "sentence_completion",
    errorCode: "THIRD_PERSON_S_MISSING",
    explanation: "He, she yoki it bilan Present Simple fe'liga -s, -es yoki -ies qo'shiladi.",
  })),
  grammar: [
    ["Yesterday we ___ a new topic.", "learned", "learn", "learns", "learning"],
    ["Choose the grammatically correct sentence.", "They are ready.", "They is ready.", "They ready are.", "They be ready."],
    ["I ___ my keys this morning.", "found", "find", "finds", "finding"],
    ["We ___ dinner when she called.", "were eating", "eat", "eats", "ate"],
  ].map((entry, index) => ({
    key: `grammar-${index + 1}`,
    text: entry[0], options: entry.slice(1), correctOption: "A",
    leafSlug: "applying-grammar-rules", legacySkill: "grammar",
    format: index % 2 === 0 ? "gap_fill" : "sentence_choice",
    errorCode: "CARELESS_SELECTION",
    explanation: "Gapdagi vaqt va ega belgilarini tekshirib, mos grammatik shakl tanlanadi.",
  })),
  vocabulary: [
    ["The word 'rapid' is closest in meaning to ___.", "fast", "quiet", "weak", "late"],
    ["If a room is 'spacious', it is ___.", "large", "dark", "noisy", "cold"],
    ["To 'purchase' something means to ___.", "buy it", "lose it", "repair it", "borrow it"],
    ["A 'reliable' person can be ___.", "trusted", "ignored", "avoided", "forgotten"],
  ].map((entry, index) => ({
    key: `vocabulary-${index + 1}`,
    text: entry[0], options: entry.slice(1), correctOption: "A",
    leafSlug: "inferring-word-meaning", legacySkill: "vocabulary",
    format: index % 2 === 0 ? "synonym" : "meaning_in_context",
    errorCode: "VOCABULARY_MEANING_CONFUSION",
    explanation: "So'z ma'nosi kontekst va yaqin ma'noli so'zlar orqali aniqlanadi.",
  })),
  reading: [
    ["Text: Sara postponed the trip because of heavy rain. What happened?", "The trip was delayed.", "Sara travelled early.", "The weather improved.", "The trip was cancelled forever."],
    ["Text: The library is free for children under twelve. Which statement matches?", "Children aged eleven pay nothing.", "All adults enter free.", "The library is closed to children.", "Only twelve-year-olds enter."],
    ["Text: Omar rarely misses practice. What does this imply?", "He attends practice regularly.", "He never practises.", "He dislikes the team.", "He is always absent."],
    ["Text: The store will remain closed until noon. When can customers enter?", "After twelve o'clock.", "Before sunrise.", "At nine o'clock.", "All morning."],
  ].map((entry, index) => ({
    key: `reading-${index + 1}`,
    text: entry[0], options: entry.slice(1), correctOption: "A",
    leafSlug: "understanding-paraphrase", legacySkill: "reading",
    format: index % 2 === 0 ? "paraphrase" : "inference",
    errorCode: "PARAPHRASE_MISINTERPRETATION",
    explanation: "To'g'ri javob matndagi fikrni boshqa so'zlar bilan aynan ifodalaydi.",
  })),
  quality: [
    {
      key: "ambiguous-question",
      text: "Choose the best word: The room was ___ after the meeting.",
      options: ["clear", "empty", "quiet", "clean"],
      correctOption: "A", leafSlug: "inferring-word-meaning", legacySkill: "vocabulary",
      format: "context_choice", errorCode: "AMBIGUOUS_OPTIONS",
      explanation: "Bir nechta variant kontekstsiz mantiqan mos kelishi mumkin.",
      qualityStatus: "POSSIBLY_AMBIGUOUS",
    },
    {
      key: "possible-wrong-key",
      text: "She ___ to work every weekday.",
      options: ["go", "goes", "going", "gone"],
      correctOption: "A", leafSlug: "selecting-s-es-ies", legacySkill: "grammar",
      format: "gap_fill", errorCode: "POSSIBLE_WRONG_KEY",
      explanation: "Yuqori o'zlashtirgan o'quvchilar B variantini tanlagani kalit xatosi ehtimolini ko'rsatadi.",
      qualityStatus: "POSSIBLE_WRONG_KEY",
    },
  ],
});

function dateAtOffset(anchor, days, minutes = 0) {
  return new Date(anchor.getTime() + (days * 86400000) + (minutes * 60000));
}

function validateDemoManifest() {
  const requiredStudents = ["present_simple", "careless_timed", "vocabulary", "reading", "improved", "regressed"];
  const keys = new Set(DEMO_STUDENTS.map((student) => student.key));
  if (DEMO_CASES.length !== 10 || requiredStudents.some((key) => !keys.has(key))) {
    throw new Error("Learning diagnostics demo manifest is incomplete");
  }
  if (QUESTION_GROUPS.present_simple.length < 10) {
    throw new Error("At least ten Present Simple questions are required for retests");
  }
  return true;
}

function assertDemoEnvironment(environment = process.env.NODE_ENV) {
  if (String(environment || "development").toLowerCase() === "production") {
    throw new Error("Learning diagnostics demo data is disabled in production");
  }
}

async function cleanupDemoData(client) {
  await client.query("DELETE FROM class_students WHERE class_id IN (SELECT id FROM classes WHERE join_code = $1)", [DEMO_CLASS_CODE]);
  await client.query("DELETE FROM classes WHERE join_code = $1", [DEMO_CLASS_CODE]);
  await client.query(
    "DELETE FROM ai_generation_logs WHERE generation_job_id IN (SELECT id FROM ai_generation_jobs WHERE idempotency_key LIKE $1)",
    [`${DEMO_VERSION}:%`],
  );
  await client.query("DELETE FROM ai_generation_jobs WHERE idempotency_key LIKE $1", [`${DEMO_VERSION}:%`]);
  await client.query(
    "DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)",
    [`${DEMO_USERNAME_PREFIX}%`],
  );
  await client.query("DELETE FROM users WHERE username LIKE $1", [`${DEMO_USERNAME_PREFIX}%`]);
  await client.query(
    "DELETE FROM battle_answers WHERE question_id IN (SELECT id FROM questions WHERE explanation LIKE $1)",
    [`${DEMO_MARKER}%`],
  );
  await client.query("DELETE FROM questions WHERE explanation LIKE $1", [`${DEMO_MARKER}%`]);
}

async function insertUser(client, user, passwordHash) {
  const result = await client.query(
    `INSERT INTO users (
       first_name, last_name, email, password, cefr_level, rating, coins, role,
       country, region, district, school, username, bio, phone
     ) VALUES ($1,$2,$3,$4,'A1',1000,250,$5,'UZ','Toshkent','Chilonzor',
       'IlmLiga Demo School',$6,$7,$8) RETURNING id`,
    [
      user.firstName,
      user.lastName,
      `${user.username}@demo.ilmliga.invalid`,
      passwordHash,
      user.role || "student",
      user.username,
      `${DEMO_MARKER} Faqat lokal diagnostika namoyishi uchun.`,
      user.phone,
    ],
  );
  return result.rows[0].id;
}

async function insertDemoUsersAndClass(client, passwordHash) {
  const teacherId = await insertUser(client, {
    username: `${DEMO_USERNAME_PREFIX}teacher`, phone: "+998990000090",
    firstName: "Demo", lastName: "Teacher", role: "teacher",
  }, passwordHash);
  const studentIds = {};
  for (const student of DEMO_STUDENTS) studentIds[student.key] = await insertUser(client, student, passwordHash);
  const classResult = await client.query(
    `INSERT INTO classes (teacher_id,name,description,join_code)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [teacherId, "Diagnostics Demo Class", `${DEMO_MARKER} Shared Present Simple weakness`, DEMO_CLASS_CODE],
  );
  const classId = classResult.rows[0].id;
  for (const studentId of Object.values(studentIds)) {
    await client.query(
      "INSERT INTO class_students (class_id,student_id,status,joined_at) VALUES ($1,$2,'active',NOW())",
      [classId, studentId],
    );
  }
  return { teacherId, studentIds, classId };
}

async function loadTaxonomy(client) {
  const result = await client.query(
    "SELECT id,node_type,parent_id,name,slug,legacy_skill FROM learning_taxonomy WHERE is_active=true",
  );
  const byId = new Map(result.rows.map((row) => [Number(row.id), row]));
  const bySlug = new Map(result.rows.map((row) => [row.slug, row]));
  for (const student of DEMO_STUDENTS) {
    if (!bySlug.has(student.leafSlug)) throw new Error(`Missing taxonomy seed: ${student.leafSlug}`);
  }
  return { byId, bySlug };
}

function taxonomyPath(taxonomy, leafSlug) {
  const path = {};
  let node = taxonomy.bySlug.get(leafSlug);
  while (node) {
    path[`${node.node_type}Id`] = Number(node.id);
    node = node.parent_id ? taxonomy.byId.get(Number(node.parent_id)) : null;
  }
  return path;
}

function allQuestionDefinitions() {
  return Object.entries(QUESTION_GROUPS).flatMap(([group, definitions]) =>
    definitions.map((definition) => ({ ...definition, group })),
  );
}

async function insertQuestionAnalysis(client, questionId, definition, taxonomy) {
  const path = taxonomyPath(taxonomy, definition.leafSlug);
  const reviewRequired = Boolean(definition.qualityStatus);
  await client.query(
    `INSERT INTO question_ai_analysis (
       question_id,status,estimated_level,level_confidence,level_evidence,main_skill_id,topic_id,
       subskill_id,micro_skill_id,taxonomy_confidence,question_type,cognitive_task,
       correct_answer_explanation,quality_warnings,diagnostic_eligible,analysis_confidence,
       provider,model,raw_analysis,analyzed_at
     ) VALUES ($1,$2,'A1',0.95,$3,$4,$5,$6,$7,0.94,$8,'apply_rule_or_infer',$9,$10,$11,0.93,
       'deterministic-demo','approved-fixture',$12,NOW())`,
    [
      questionId,
      reviewRequired ? "REVIEW_REQUIRED" : "READY",
      JSON.stringify(["Demo CEFR evidence"]),
      path.main_skillId || null,
      path.topicId || null,
      path.subskillId || null,
      path.micro_skillId || null,
      definition.format,
      definition.explanation,
      JSON.stringify(reviewRequired ? [{ code: definition.qualityStatus }] : []),
      !reviewRequired,
      JSON.stringify({ demo_version: DEMO_VERSION, leaf_slug: definition.leafSlug }),
    ],
  );
  const roles = [[path.main_skillId, "main_skill"], [path.topicId, "topic"], [path.subskillId, "subskill"], [path.micro_skillId, "micro_skill"]];
  for (const [taxonomyId, role] of roles) {
    if (!taxonomyId) continue;
    await client.query(
      "INSERT INTO question_taxonomy_tags (question_id,taxonomy_id,tag_role,confidence,source) VALUES ($1,$2,$3,0.94,'admin')",
      [questionId, taxonomyId, role],
    );
  }
  return path;
}

async function insertDemoQuestions(client, taxonomy) {
  const questionIds = {};
  for (const definition of allQuestionDefinitions()) {
    const result = await client.query(
      `INSERT INTO questions (
         question_text,option_a,option_b,option_c,option_d,correct_option,cefr_level,skill,
         difficulty,explanation,status,analysis_status,diagnostic_eligible,analysis_version
       ) VALUES ($1,$2,$3,$4,$5,$6,'A1',$7,'easy',$8,'draft',$9,$10,1) RETURNING id`,
      [
        definition.text,
        ...definition.options,
        definition.correctOption,
        definition.legacySkill,
        `${DEMO_MARKER} ${definition.explanation}`,
        definition.qualityStatus ? "REVIEW_REQUIRED" : "READY",
        !definition.qualityStatus,
      ],
    );
    const questionId = result.rows[0].id;
    await insertQuestionAnalysis(client, questionId, definition, taxonomy);
    await client.query(
      `INSERT INTO question_distractor_analysis (
         question_id,option_code,error_code,likely_reason,confidence,source
       ) VALUES ($1,'B',$2,$3,0.92,'admin')`,
      [questionId, definition.errorCode, definition.explanation],
    );
    questionIds[definition.group] ||= [];
    questionIds[definition.group].push({ id: questionId, ...definition });
  }
  return questionIds;
}

function answerBlueprints(student) {
  const entries = [];
  const sourceModes = ["battle", "practice", "teacher_assignment", "class_exam"];
  for (let index = 0; index < student.errorCount; index += 1) {
    const recentRegression = student.key === "regressed" && index >= student.errorCount - 3;
    entries.push({
      isCorrect: false,
      offset: recentRegression ? TIMELINE_OFFSETS.regression - ((student.errorCount - 1 - index) * 0.2) : TIMELINE_OFFSETS.originalErrors + index,
      sourceMode: sourceModes[index % sourceModes.length],
      responseTimeMs: student.key === "careless_timed" ? 1400 + (index * 180) : 9000 + (index * 600),
      recentRegression,
    });
  }
  for (let index = 0; index < student.correctCount; index += 1) {
    entries.push({
      isCorrect: true,
      offset: student.remediation ? TIMELINE_OFFSETS.retest + index : TIMELINE_OFFSETS.originalErrors + student.errorCount + index,
      sourceMode: sourceModes[(student.errorCount + index) % sourceModes.length],
      responseTimeMs: 7000 + (index * 500),
      recentRegression: false,
    });
  }
  return entries;
}

function questionGroupForStudent(student) {
  if (["present_simple", "improved", "regressed"].includes(student.key)) return "present_simple";
  if (student.key === "careless_timed") return "grammar";
  return student.key;
}

async function insertStudentAnswers(client, student, studentId, questionIds, taxonomy, anchor) {
  const group = questionGroupForStudent(student);
  const questions = questionIds[group];
  const leaf = taxonomy.bySlug.get(student.leafSlug);
  const path = taxonomyPath(taxonomy, student.leafSlug);
  const blueprints = answerBlueprints(student);
  let incorrectCount = 0;
  for (let index = 0; index < blueprints.length; index += 1) {
    const blueprint = blueprints[index];
    const question = questions[index % questions.length];
    const selectedOption = blueprint.isCorrect ? question.correctOption : "B";
    const answerResult = await client.query(
      `INSERT INTO student_answer_events (
         student_id,question_id,source_mode,source_record_id,source_question_id,selected_option,
         correct_option,is_correct,timed_out,response_time_ms,attempt_number,detected_cefr_level,
         legacy_skill,main_skill_id,topic_id,subskill_id,micro_skill_id,
         selected_distractor_error_code,question_diagnostic_eligible,question_analysis_version,
         skill_state_before,event_metadata,answered_at,idempotency_key
       ) VALUES ($1,$2,$3,$4,$2,$5,$6,$7,false,$8,1,'A1',$9,$10,$11,$12,$13,$14,true,
         'question_analysis_v1',$15,$16,$17,$18) RETURNING id`,
      [
        studentId, question.id, blueprint.sourceMode,
        `${DEMO_VERSION}:${student.key}:session:${Math.floor(index / 2) + 1}`,
        selectedOption, question.correctOption, blueprint.isCorrect, blueprint.responseTimeMs,
        question.legacySkill, path.main_skillId || null, path.topicId || null,
        path.subskillId || null, path.micro_skillId || null,
        blueprint.isCorrect ? null : question.errorCode,
        blueprint.recentRegression ? JSON.stringify({ mastery_score: 91, evidence_state: "MASTERED" }) : null,
        JSON.stringify({ demo_version: DEMO_VERSION, question_format: question.format, timed_context: student.key === "careless_timed" }),
        dateAtOffset(anchor, blueprint.offset, index),
        `${DEMO_VERSION}:${student.key}:answer:${index + 1}`,
      ],
    );
    if (!blueprint.isCorrect) {
      incorrectCount += 1;
      await client.query(
        `INSERT INTO student_error_events (
           answer_event_id,student_id,taxonomy_id,system_classification,final_classification,
           classification_confidence,evidence,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,$4,0.92,$5,$6,$6)`,
        [
          answerResult.rows[0].id, studentId, Number(leaf.id), student.classification,
          JSON.stringify({ demo_version: DEMO_VERSION, repeated_pattern: true, source_mode: blueprint.sourceMode }),
          dateAtOffset(anchor, blueprint.offset, index),
        ],
      );
    }
  }
  return { exposureCount: blueprints.length, incorrectCount, correctCount: blueprints.length - incorrectCount };
}

async function insertProfileAndFinding(client, student, studentId, taxonomy, stats, anchor) {
  const taxonomyNode = taxonomy.bySlug.get(student.leafSlug);
  const errorRate = Number(((stats.incorrectCount / stats.exposureCount) * 100).toFixed(2));
  const findingActive = student.state !== "MASTERED";
  await client.query(
    `INSERT INTO student_skill_profiles (
       student_id,taxonomy_id,taxonomy_level,exposure_count,correct_count,incorrect_count,
       distinct_question_count,session_count,format_count,weighted_accuracy,error_rate,
       average_response_time_ms,analysis_quality,mastery_score,confidence_score,confidence_label,
       retention_score,current_evidence_state,last_attempt,last_correct_attempt,last_incorrect_attempt,
       last_lesson_date,next_review_date,regression_flag,current_priority,dominant_error_classification,
       active_finding_count,pattern_summary
     ) VALUES ($1,$2,$3,$4,$5,$6,$4,4,2,$7,$8,9000,0.94,$9,$10,'high',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      studentId, Number(taxonomyNode.id), taxonomyNode.node_type, stats.exposureCount,
      stats.correctCount, stats.incorrectCount, 100 - errorRate, errorRate, student.mastery,
      student.confidence, student.state === "MASTERED" ? 91 : (student.state === "REGRESSED" ? 44 : 30),
      student.state, dateAtOffset(anchor, student.key === "regressed" ? -1 : -6),
      dateAtOffset(anchor, -6), dateAtOffset(anchor, student.key === "regressed" ? -1 : -16),
      student.remediation ? dateAtOffset(anchor, TIMELINE_OFFSETS.lesson) : null,
      student.state === "MASTERED" ? null : dateAtOffset(anchor, 1),
      student.state === "REGRESSED", student.priority, student.classification,
      findingActive ? 1 : 0,
      JSON.stringify({ demo_version: DEMO_VERSION, case_key: student.key, shared_class_weakness: student.leafSlug === "selecting-s-es-ies" }),
    ],
  );
  const findingResult = await client.query(
    `INSERT INTO learning_findings (
       student_id,taxonomy_id,finding_code,finding_type,error_classification,severity,confidence,
       evidence_state,occurrence_count,evidence,recommended_action,is_active,first_detected_at,
       last_detected_at,resolved_at
     ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,'TARGETED_LESSON',$10,$11,$12,$13) RETURNING id`,
    [
      studentId, Number(taxonomyNode.id), `${DEMO_VERSION}:${student.key}`, student.classification,
      student.priority >= 90 ? "critical" : student.priority >= 80 ? "high" : "medium",
      student.confidence / 100, student.state, stats.incorrectCount,
      JSON.stringify({ demo_version: DEMO_VERSION, error_rate: errorRate, source_count: 4, format_count: 2 }),
      findingActive, dateAtOffset(anchor, TIMELINE_OFFSETS.originalErrors),
      dateAtOffset(anchor, student.key === "regressed" ? TIMELINE_OFFSETS.regression : -6),
      findingActive ? null : dateAtOffset(anchor, TIMELINE_OFFSETS.review7),
    ],
  );
  return findingResult.rows[0].id;
}

async function insertMasteryHistory(client, student, studentId, taxonomyId, anchor) {
  const stages = [
    [TIMELINE_OFFSETS.originalErrors, 25, 42, "OBSERVED"],
    [TIMELINE_OFFSETS.lesson, 38, 60, "REMEDIATING"],
    [TIMELINE_OFFSETS.retest, 64, 72, "IMPROVING"],
    [TIMELINE_OFFSETS.review1, 73, 76, "STABLE"],
    [TIMELINE_OFFSETS.review3, 83, 82, "STABLE"],
    [TIMELINE_OFFSETS.review7, 91, 88, "MASTERED"],
  ];
  if (student.remediation === "regressed") stages.push([TIMELINE_OFFSETS.regression, 49, 90, "REGRESSED"]);
  let previousMastery = null;
  let previousState = null;
  for (const [offset, mastery, confidence, state] of stages) {
    await client.query(
      `INSERT INTO mastery_history (
         student_id,taxonomy_id,previous_mastery_score,mastery_score,confidence_score,
         previous_evidence_state,evidence_state,evidence_snapshot,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [studentId, taxonomyId, previousMastery, mastery, confidence, previousState, state,
        JSON.stringify({ demo_version: DEMO_VERSION, timeline_offset_days: offset }), dateAtOffset(anchor, offset)],
    );
    previousMastery = mastery;
    previousState = state;
  }
}

async function insertAssessment(client, context, assessmentType, sequenceNo, offset, passed) {
  const assessmentResult = await client.query(
    `INSERT INTO targeted_retests (
       remediation_plan_id,student_id,taxonomy_id,assessment_type,sequence_no,status,
       quality_status,scheduled_for,question_count,required_correct,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,'COMPLETED','APPROVED',$6,10,8,$6,$6) RETURNING id`,
    [context.planId, context.studentId, context.taxonomyId, assessmentType, sequenceNo, dateAtOffset(context.anchor, offset)],
  );
  const assessmentId = assessmentResult.rows[0].id;
  const assessmentQuestionIds = [];
  for (let index = 0; index < 10; index += 1) {
    const question = context.questions[index];
    const questionResult = await client.query(
      `INSERT INTO targeted_retest_questions (
         targeted_retest_id,source_question_id,position,question_format,prompt,options,
         correct_option,explanation
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [assessmentId, question.id, index + 1, question.format, question.text,
        JSON.stringify(question.options), question.correctOption, question.explanation],
    );
    assessmentQuestionIds.push({ id: questionResult.rows[0].id, question });
  }
  const correctCount = passed ? 9 : 4;
  const attemptResult = await client.query(
    `INSERT INTO retest_attempts (
       targeted_retest_id,student_id,started_at,completed_at,correct_count,total_count,accuracy,passed
     ) VALUES ($1,$2,$3,$4,$5,10,$6,$7) RETURNING id`,
    [assessmentId, context.studentId, dateAtOffset(context.anchor, offset, -20),
      dateAtOffset(context.anchor, offset), correctCount, correctCount * 10, passed],
  );
  for (let index = 0; index < assessmentQuestionIds.length; index += 1) {
    const assessmentQuestion = assessmentQuestionIds[index];
    const isCorrect = index < correctCount;
    await client.query(
      `INSERT INTO retest_attempt_answers (
         retest_attempt_id,assessment_question_id,student_id,selected_option,is_correct,
         response_time_ms,answered_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [attemptResult.rows[0].id, assessmentQuestion.id, context.studentId,
        isCorrect ? assessmentQuestion.question.correctOption : "B", isCorrect,
        6500 + (index * 250), dateAtOffset(context.anchor, offset, index)],
    );
  }
  return assessmentId;
}

async function insertRemediationLoop(client, student, studentId, findingId, taxonomy, questions, anchor) {
  const taxonomyId = Number(taxonomy.bySlug.get(student.leafSlug).id);
  const planStatus = student.remediation === "regressed" ? "REGRESSED" : "MASTERED";
  const planResult = await client.query(
    `INSERT INTO remediation_plans (
       student_id,taxonomy_id,source_finding_id,status,priority,evidence_snapshot,assigned_at,
       started_at,completed_at,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$7,$10) RETURNING id`,
    [studentId, taxonomyId, findingId, planStatus, student.priority,
      JSON.stringify({ demo_version: DEMO_VERSION, original_error_offset: TIMELINE_OFFSETS.originalErrors }),
      dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, -30), dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, -20),
      dateAtOffset(anchor, TIMELINE_OFFSETS.lesson),
      dateAtOffset(anchor, student.remediation === "regressed" ? TIMELINE_OFFSETS.regression : TIMELINE_OFFSETS.review7)],
  );
  const planId = planResult.rows[0].id;
  const lessonContent = fallbackLesson({
    taxonomy_id: taxonomyId,
    skill_name: taxonomy.bySlug.get(student.leafSlug).name,
    legacy_skill: "grammar",
    taxonomy_description: "Present Simple third-person singular form",
    evidence_state: "CONFIRMED",
    confidence: 0.88,
    priority: student.priority,
    occurrence_count: student.errorCount,
    evidence: { demo_version: DEMO_VERSION, distractor: "THIRD_PERSON_S_MISSING" },
  }, questions.slice(0, 3).map((question) => ({
    question_text: question.text,
    selected_answer: question.options[1],
    correct_answer: question.options[0],
    explanation: question.explanation,
  })), []);
  const serializedLesson = JSON.stringify(lessonContent);
  const lessonResult = await client.query(
    `INSERT INTO personalized_lessons (
       remediation_plan_id,student_id,taxonomy_id,generation_source,quality_status,status,
       progress_percent,lesson_content,content_hash,started_at,completed_at,created_at,updated_at
     ) VALUES ($1,$2,$3,'fallback','APPROVED','COMPLETED',100,$4,$5,$6,$7,$6,$7) RETURNING id`,
    [planId, studentId, taxonomyId, serializedLesson,
      crypto.createHash("sha256").update(serializedLesson).digest("hex"),
      dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, -20), dateAtOffset(anchor, TIMELINE_OFFSETS.lesson)],
  );
  const lessonId = lessonResult.rows[0].id;
  for (let index = 0; index < 3; index += 1) {
    const question = questions[index];
    const exerciseResult = await client.query(
      `INSERT INTO personalized_lesson_exercises (
         lesson_id,source_question_id,section,position,question_format,prompt,options,
         correct_option,explanation
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [lessonId, question.id, ["guided_practice", "error_correction", "final_check"][index],
        1, question.format, question.text, JSON.stringify(question.options), question.correctOption, question.explanation],
    );
    await client.query(
      `INSERT INTO personalized_lesson_exercise_attempts (
         lesson_id,exercise_id,student_id,selected_option,is_correct,answered_at
       ) VALUES ($1,$2,$3,$4,true,$5)`,
      [lessonId, exerciseResult.rows[0].id, studentId, question.correctOption,
        dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, index)],
    );
  }
  await insertRemediationHistory(client, { planId, studentId, student, anchor });
  const assessmentContext = { planId, studentId, taxonomyId, questions, anchor };
  await insertAssessment(client, assessmentContext, "RETEST", 1, TIMELINE_OFFSETS.retest, true);
  const reviews = [[1, 1, TIMELINE_OFFSETS.review1], [2, 3, TIMELINE_OFFSETS.review3], [3, 7, TIMELINE_OFFSETS.review7]];
  for (const [sequence, interval, offset] of reviews) {
    const assessmentId = await insertAssessment(client, assessmentContext, "REVIEW", sequence, offset, true);
    await client.query(
      `INSERT INTO review_schedules (
         remediation_plan_id,student_id,taxonomy_id,sequence_no,interval_days,scheduled_for,
         status,targeted_retest_id,completed_at,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'COMPLETED',$7,$6,$6,$6)`,
      [planId, studentId, taxonomyId, sequence, interval, dateAtOffset(anchor, offset), assessmentId],
    );
  }
  await client.query(
    `INSERT INTO review_schedules (
       remediation_plan_id,student_id,taxonomy_id,sequence_no,interval_days,scheduled_for,
       status,created_at,updated_at
     ) VALUES ($1,$2,$3,4,21,$4,'PENDING',$5,$5)`,
    [planId, studentId, taxonomyId, dateAtOffset(anchor, TIMELINE_OFFSETS.review21),
      dateAtOffset(anchor, TIMELINE_OFFSETS.review7)],
  );
  await client.query(
    `INSERT INTO notifications (user_id,type,message,is_read,created_at)
     VALUES ($1,'learning_review_due',$2,true,$3)`,
    [studentId, "Present Simple bo'yicha 7 kunlik takrorlash tayyor.",
      dateAtOffset(anchor, TIMELINE_OFFSETS.review7, -30)],
  );
  await insertMasteryHistory(client, student, studentId, taxonomyId, anchor);
  return { planId, lessonId };
}

async function insertRemediationHistory(client, context) {
  const events = [
    [null, "CONFIRMED", "FINDING_CONFIRMED", TIMELINE_OFFSETS.originalErrors],
    ["CONFIRMED", "REMEDIATING", "LESSON_COMPLETED", TIMELINE_OFFSETS.lesson],
    ["REMEDIATING", "IMPROVING", "RETEST_COMPLETED", TIMELINE_OFFSETS.retest],
    ["IMPROVING", "STABLE", "REVIEW_1_DAY_COMPLETED", TIMELINE_OFFSETS.review1],
    ["STABLE", "STABLE", "REVIEW_3_DAY_COMPLETED", TIMELINE_OFFSETS.review3],
    ["STABLE", "MASTERED", "REVIEW_7_DAY_COMPLETED", TIMELINE_OFFSETS.review7],
  ];
  if (context.student.remediation === "regressed") {
    events.push(["MASTERED", "REGRESSED", "REGRESSION_DETECTED", TIMELINE_OFFSETS.regression]);
  }
  for (const [fromStatus, toStatus, eventType, offset] of events) {
    await client.query(
      `INSERT INTO remediation_history (
         remediation_plan_id,student_id,from_status,to_status,event_type,event_payload,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [context.planId, context.studentId, fromStatus, toStatus, eventType,
        JSON.stringify({ demo_version: DEMO_VERSION, timeline_offset_days: offset }),
        dateAtOffset(context.anchor, offset)],
    );
  }
}

async function insertQuestionQualityCases(client, questionIds, anchor) {
  for (const question of questionIds.quality) {
    const ambiguous = question.qualityStatus === "POSSIBLY_AMBIGUOUS";
    const metrics = ambiguous
      ? { correct: 16, incorrect: 14, highMastery: 20, highMasteryFailures: 9, selections: { A: 16, B: 7, C: 5, D: 2 } }
      : { correct: 5, incorrect: 25, highMastery: 18, highMasteryFailures: 16, selections: { A: 5, B: 22, C: 2, D: 1 } };
    await client.query(
      `INSERT INTO question_quality_metrics (
         question_id,attempt_count,correct_count,incorrect_count,average_response_time_ms,
         high_mastery_attempt_count,high_mastery_failure_count,option_selection_counts,
         observed_question_challenge,cohort_error_rate,cohort_average_response_time_ms,
         evidence_sufficient,quality_status,source_snapshot_hash,evaluated_at
       ) VALUES ($1,30,$2,$3,11000,$4,$5,$6,$7,$8,11000,true,$9,$10,$11)`,
      [question.id, metrics.correct, metrics.incorrect, metrics.highMastery, metrics.highMasteryFailures,
        JSON.stringify(metrics.selections), (metrics.incorrect / 30) * 100, (metrics.incorrect / 30) * 100,
        question.qualityStatus, `${DEMO_VERSION}:${question.key}`, dateAtOffset(anchor, -2)],
    );
    await client.query(
      `INSERT INTO question_quality_flags (
         question_id,flag_code,severity,status,evidence,first_detected_at,last_detected_at
       ) VALUES ($1,$2,'high','open',$3,$4,$4)`,
      [question.id, question.qualityStatus,
        JSON.stringify({ demo_version: DEMO_VERSION, option_selection_counts: metrics.selections }),
        dateAtOffset(anchor, -2)],
    );
  }
}

async function insertAiFallbackAudit(client, planId, lessonId, anchor) {
  const jobResult = await client.query(
    `INSERT INTO ai_generation_jobs (
       job_type,entity_type,entity_id,payload,status,retry_count,max_retries,completed_at,
       last_error,idempotency_key,created_at,updated_at
     ) VALUES ('personalized_lesson','remediation_plan',$1,$2,'failed',3,3,$3,$4,$5,$3,$3)
     RETURNING id`,
    [String(planId), JSON.stringify({ demo_version: DEMO_VERSION, lesson_id: lessonId }),
      dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, -25),
      "AI provider unavailable; approved deterministic fallback used",
      `${DEMO_VERSION}:ai-fallback:plan:${planId}`],
  );
  const jobId = jobResult.rows[0].id;
  await client.query(
    `INSERT INTO ai_generation_logs (
       generation_job_id,event_type,attempt_number,provider,model,latency_ms,error_code,
       error_message,metadata,created_at
     ) VALUES ($1,'failed',3,'demo-provider','demo-model',1200,'PROVIDER_UNAVAILABLE',$2,$3,$4)`,
    [jobId, "Provider unavailable", JSON.stringify({ demo_version: DEMO_VERSION }),
      dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, -25)],
  );
  await client.query(
    `INSERT INTO ai_generation_logs (
       generation_job_id,event_type,attempt_number,metadata,created_at
     ) VALUES ($1,'fallback_used',3,$2,$3)`,
    [jobId, JSON.stringify({ demo_version: DEMO_VERSION, lesson_id: lessonId, template: "approved" }),
      dateAtOffset(anchor, TIMELINE_OFFSETS.lesson, -24)],
  );
}

async function insertReportLifecycle(client, studentId, anchor) {
  const periodStart = dateAtOffset(anchor, -7);
  const periodEnd = anchor;
  const snapshot = JSON.stringify({ demo_version: DEMO_VERSION, cefr_level: "A1" });
  const staleOutput = JSON.stringify({ status: "superseded", reason: "new_answer_event" });
  const freshOutput = JSON.stringify({
    status: "generated",
    summary: "Present Simple bo'yicha darsdan keyin barqaror yaxshilanish kuzatildi.",
    evidence_state: "MASTERED",
  });
  await client.query(
    `INSERT INTO ai_reports (
       user_id,target_student_id,report_type,audience,period_start,period_end,input_snapshot,
       ai_output,confidence,status,created_at,is_stale,stale_at,report_version,schema_version,
       source_snapshot_hash,prompt_version
     ) VALUES ($1,$1,'student_learning_7d','student',$2,$3,$4,$5,'high','generated',$6,true,$7,
       'student_learning_v1','student_learning_report_v1',$8,'student_learning_prompt_v1')`,
    [studentId, periodStart, periodEnd, snapshot, staleOutput, dateAtOffset(anchor, -1, -10),
      dateAtOffset(anchor, -1), `${DEMO_VERSION}:stale`],
  );
  await client.query(
    `INSERT INTO ai_reports (
       user_id,target_student_id,report_type,audience,period_start,period_end,input_snapshot,
       ai_output,confidence,status,created_at,is_stale,report_version,schema_version,
       source_snapshot_hash,prompt_version
     ) VALUES ($1,$1,'student_learning_7d','student',$2,$3,$4,$5,'high','generated',$3,false,
       'student_learning_v1','student_learning_report_v1',$6,'student_learning_prompt_v1')`,
    [studentId, periodStart, periodEnd, snapshot, freshOutput, `${DEMO_VERSION}:fresh`],
  );
}

function buildDemoSummary(context, committed) {
  return {
    version: DEMO_VERSION,
    committed,
    teacherId: context.teacherId,
    classId: context.classId,
    studentCount: Object.keys(context.studentIds).length,
    questionCount: Object.values(context.questionIds).reduce((total, group) => total + group.length, 0),
    cases: [...DEMO_CASES],
    timelineOffsets: { ...TIMELINE_OFFSETS },
    usernames: DEMO_STUDENTS.map((student) => student.username),
  };
}

async function seedLearningDiagnosticsDemo(pool, options = {}) {
  validateDemoManifest();
  assertDemoEnvironment(options.environment);
  const mode = options.mode || "dry-run";
  if (!['apply', 'dry-run'].includes(mode)) throw new Error(`Unsupported demo seed mode: ${mode}`);
  const anchor = options.now instanceof Date ? options.now : new Date();
  const password = options.password || process.env.DEMO_LEARNING_PASSWORD || DEFAULT_DEMO_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await cleanupDemoData(client);
    const taxonomy = await loadTaxonomy(client);
    const userContext = await insertDemoUsersAndClass(client, passwordHash);
    const questionIds = await insertDemoQuestions(client, taxonomy);
    const findings = {};
    for (const student of DEMO_STUDENTS) {
      const studentId = userContext.studentIds[student.key];
      const stats = await insertStudentAnswers(client, student, studentId, questionIds, taxonomy, anchor);
      findings[student.key] = await insertProfileAndFinding(client, student, studentId, taxonomy, stats, anchor);
    }
    const loops = {};
    for (const student of DEMO_STUDENTS.filter((entry) => entry.remediation)) {
      loops[student.key] = await insertRemediationLoop(
        client, student, userContext.studentIds[student.key], findings[student.key],
        taxonomy, questionIds.present_simple, anchor,
      );
    }
    await insertQuestionQualityCases(client, questionIds, anchor);
    await insertAiFallbackAudit(client, loops.improved.planId, loops.improved.lessonId, anchor);
    await insertReportLifecycle(client, userContext.studentIds.improved, anchor);
    const summary = buildDemoSummary({ ...userContext, questionIds }, mode === "apply");
    await client.query(mode === "apply" ? "COMMIT" : "ROLLBACK");
    return summary;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function removeLearningDiagnosticsDemo(pool, options = {}) {
  assertDemoEnvironment(options.environment);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await cleanupDemoData(client);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  DEFAULT_DEMO_PASSWORD,
  DEMO_CASES,
  DEMO_CLASS_CODE,
  DEMO_MARKER,
  DEMO_STUDENTS,
  DEMO_USERNAME_PREFIX,
  DEMO_VERSION,
  QUESTION_GROUPS,
  TIMELINE_OFFSETS,
  assertDemoEnvironment,
  buildDemoSummary,
  cleanupDemoData,
  removeLearningDiagnosticsDemo,
  seedLearningDiagnosticsDemo,
  validateDemoManifest,
};
