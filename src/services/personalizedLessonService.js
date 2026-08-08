const crypto = require("crypto");
const { approvedLessonTemplate } = require("./approvedLessonTemplateService");

const LESSON_SCHEMA_VERSION = "personalized_lesson_v1";
const LESSON_PROMPT_VERSION = "personalized_lesson_prompt_v1";
const ACTIVE_STATES = ["CONFIRMED", "REGRESSED"];
const VALID_OPTIONS = new Set(["A", "B", "C", "D"]);
const LEVEL_ORDER = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"];

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
    && text(question.question_text).length >= 4
    && !originalTexts.has(text(question.question_text).toLowerCase())
    && VALID_OPTIONS.has(text(question.correct_option, 1).toUpperCase())
    && values.every(Boolean)
    && new Set(values.map((value) => value.toLowerCase())).size === values.length
    && text(question.explanation).length >= 4
    && (questionLevel < 0 || learnerLevel < 0 || questionLevel <= learnerLevel);
}

function sectionFor(index, total) {
  if (index < 2) return "guided_practice";
  if (index < Math.min(4, total)) return "independent_practice";
  if (index === total - 1) return "final_check";
  return index % 2 ? "error_correction" : "transfer_practice";
}

function makeExercises(questions) {
  return questions.slice(0, 10).map((question, index, list) => ({
    source_question_id: Number(question.id),
    section: sectionFor(index, list.length),
    position: index + 1,
    question_format: text(question.question_type, 80) || "multiple_choice",
    prompt: text(question.question_text), options: safeOptions(question),
    correct_option: text(question.correct_option, 1).toUpperCase(),
    explanation: text(question.explanation),
  }));
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

function fallbackLesson(target, errors, exercises) {
  const first = errors[0] || {};
  const evidence = target.evidence || {};
  const template = approvedLessonTemplate({
    legacySkill: target.legacy_skill,
    errorExplanation: first.explanation,
    taxonomyDescription: target.taxonomy_description,
  });
  const rule = template.rule;
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
    lesson_title: target.skill_name,
    target_skill_id: Number(target.taxonomy_id),
    fallback_template: {
      version: template.version,
      key: template.key,
      category: template.category,
      rule_source: template.rule_source,
    },
    diagnostic_summary: {
      student_message: `${target.skill_name} bo'yicha ${Number(evidence.incorrect || target.occurrence_count || 0)} ta xato dalili kuzatildi. Ushbu dars aynan shu ko'nikmani mustahkamlaydi.`,
      teacher_message: `${target.evidence_state} holat, ishonch ${Math.round(Number(target.confidence || 0) * 100)}%, ustuvorlik ${Math.round(Number(target.priority || 0))}.`,
    },
    learning_objective: `${target.skill_name}: ${template.objective}`,
    micro_explanation: { rule, examples: worked.slice(0, 3) },
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

function normalizeAiLesson(candidate, target, fallback) {
  if (!candidate || typeof candidate !== "object" || candidate.schema_version !== LESSON_SCHEMA_VERSION
      || Number(candidate.target_skill_id) !== Number(target.taxonomy_id)
      || !validString(candidate.lesson_title, 300) || !validString(candidate.learning_objective)
      || !candidate.diagnostic_summary || !validString(candidate.diagnostic_summary.student_message)
      || !validString(candidate.diagnostic_summary.teacher_message)
      || !candidate.micro_explanation || !validString(candidate.micro_explanation.rule)
      || !Array.isArray(candidate.micro_explanation.examples)
      || !Array.isArray(candidate.worked_examples)) return null;
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
      student_message: text(candidate.diagnostic_summary.student_message),
      teacher_message: fallback.diagnostic_summary.teacher_message,
    },
    learning_objective: text(candidate.learning_objective),
    micro_explanation: {
      rule: text(candidate.micro_explanation.rule),
      examples: Array.isArray(candidate.micro_explanation.examples)
        ? candidate.micro_explanation.examples.slice(0, 5) : [],
    },
    worked_examples: safeWorked,
  };
}

async function resolveGeneratedLesson({ aiService, target, fallback, logger = console }) {
  if (!aiService || typeof aiService.generatePersonalizedLesson !== "function") {
    return { lesson: fallback, source: "fallback", warnings: [] };
  }
  try {
    const generated = await aiService.generatePersonalizedLesson({
      cefr_level: target.cefr_level,
      target_skill: {
        id: Number(target.taxonomy_id), name: target.skill_name,
        evidence_state: target.evidence_state, confidence: Number(target.confidence),
        mastery: Number(target.mastery_score), evidence: target.evidence,
      },
      student_error_examples: fallback.student_error_examples,
    });
    const normalized = normalizeAiLesson(generated && generated.lesson, target, fallback);
    if (normalized) return { lesson: normalized, source: "ai", warnings: [] };
    if (generated && generated.error) {
      logger.error("Personalized lesson AI fallback:", generated.error);
      return { lesson: fallback, source: "fallback", warnings: ["AI_GENERATION_FAILED"] };
    }
    return { lesson: fallback, source: "fallback", warnings: ["AI_LESSON_REJECTED"] };
  } catch (error) {
    logger.error("Personalized lesson AI fallback:", error.message);
    return { lesson: fallback, source: "fallback", warnings: ["AI_GENERATION_FAILED"] };
  }
}

function createPersonalizedLessonService({ pool, aiService, logger = console }) {
  async function loadTargets(studentId) {
    const result = await pool.query(
      `WITH candidates AS (
         SELECT DISTINCT ON (f.taxonomy_id)
                f.id AS finding_id,f.taxonomy_id,f.finding_code,f.finding_type,f.severity,
                f.confidence,f.evidence_state,f.occurrence_count,f.evidence,f.recommended_action,
                t.name AS skill_name,t.description AS taxonomy_description,t.legacy_skill,
                p.current_priority AS priority,p.mastery_score,p.confidence_score,u.first_name,u.cefr_level
         FROM learning_findings f
         JOIN learning_taxonomy t ON t.id=f.taxonomy_id
         JOIN student_skill_profiles p ON p.student_id=f.student_id AND p.taxonomy_id=f.taxonomy_id
         JOIN users u ON u.id=f.student_id
         WHERE f.student_id=$1 AND f.is_active=true AND f.evidence_state=ANY($2)
           AND NOT EXISTS (
             SELECT 1 FROM remediation_plans rp
             WHERE rp.student_id=f.student_id AND rp.taxonomy_id=f.taxonomy_id
               AND rp.status NOT IN ('STABLE','MASTERED')
           )
         ORDER BY f.taxonomy_id,p.current_priority DESC,f.confidence DESC,f.occurrence_count DESC,f.id DESC
       )
       SELECT * FROM candidates
       ORDER BY priority DESC,confidence DESC,occurrence_count DESC
       LIMIT 3`,
      [studentId, ACTIVE_STATES]
    );
    return result.rows;
  }

  async function loadEvidence(studentId, target) {
    const errors = await pool.query(
      `SELECT ae.question_id,COALESCE(q.question_text,'') AS question_text,
              COALESCE(q.explanation,'') AS explanation,
              CASE ae.selected_option WHEN 'A' THEN q.option_a WHEN 'B' THEN q.option_b
                   WHEN 'C' THEN q.option_c WHEN 'D' THEN q.option_d ELSE ae.selected_option END AS selected_answer,
              CASE ae.correct_option WHEN 'A' THEN q.option_a WHEN 'B' THEN q.option_b
                   WHEN 'C' THEN q.option_c WHEN 'D' THEN q.option_d ELSE ae.correct_option END AS correct_answer
       FROM student_answer_events ae
       LEFT JOIN questions q ON q.id=ae.question_id
       WHERE ae.student_id=$1 AND ae.is_correct=false AND ae.question_diagnostic_eligible=true
         AND $2=ANY(ARRAY[ae.main_skill_id,ae.topic_id,ae.subskill_id,ae.micro_skill_id]::bigint[])
       ORDER BY ae.answered_at DESC LIMIT 6`,
      [studentId, target.taxonomy_id]
    );
    const originalIds = errors.rows.map((item) => item.question_id).filter(Boolean);
    const questions = await pool.query(
      `WITH RECURSIVE lineage AS (
         SELECT id,parent_id,0 AS depth FROM learning_taxonomy WHERE id=$1
         UNION ALL
         SELECT t.id,t.parent_id,l.depth+1 FROM learning_taxonomy t JOIN lineage l ON l.parent_id=t.id
       )
       SELECT DISTINCT ON (q.id) q.*,qa.question_type,l.depth
       FROM lineage l
       JOIN question_taxonomy_tags qt ON qt.taxonomy_id=l.id
       JOIN questions q ON q.id=qt.question_id
       JOIN question_ai_analysis qa ON qa.question_id=q.id
       WHERE q.diagnostic_eligible=true AND qa.diagnostic_eligible=true
         AND (q.status IS NULL OR q.status IN ('active','published'))
         AND NOT (q.id=ANY($2::int[]))
       ORDER BY q.id,l.depth ASC
       LIMIT 20`,
      [target.taxonomy_id, originalIds]
    );
    const originals = new Set(errors.rows.map((item) => text(item.question_text).toLowerCase()).filter(Boolean));
    const approved = questions.rows.filter((item) => isApprovedExercise(item, originals, target.cefr_level));
    return { errors: errors.rows, exercises: makeExercises(approved) };
  }

  async function acquirePlan(studentId, target) {
    const result = await pool.query(
      `INSERT INTO remediation_plans
         (student_id,taxonomy_id,source_finding_id,status,priority,evidence_snapshot)
       VALUES ($1,$2,$3,'GENERATING',$4,$5::jsonb)
       ON CONFLICT DO NOTHING RETURNING id`,
      [studentId, target.taxonomy_id, target.finding_id, target.priority,
        JSON.stringify({ finding_code: target.finding_code, evidence_state: target.evidence_state,
          confidence: target.confidence, evidence: target.evidence })]
    );
    return result.rows[0] || null;
  }

  async function persistLesson(studentId, target, planId, lesson, exercises, source, warnings) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const qualityStatus = exercises.length >= 3 ? "APPROVED" : "REVIEW_REQUIRED";
      const status = qualityStatus === "APPROVED" ? "ASSIGNED" : "READY";
      const saved = await client.query(
        `INSERT INTO personalized_lessons
           (remediation_plan_id,student_id,taxonomy_id,schema_version,prompt_version,generation_source,
            quality_status,quality_warnings,status,lesson_content,content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11) RETURNING *`,
        [planId,studentId,target.taxonomy_id,LESSON_SCHEMA_VERSION,LESSON_PROMPT_VERSION,source,
          qualityStatus,JSON.stringify(warnings),status,JSON.stringify(lesson),hashContent(lesson)]
      );
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
          exercise_count: exercises.length, warnings })]
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
    const plan = await acquirePlan(studentId, target);
    if (!plan) return null;
    try {
      const evidence = await loadEvidence(studentId, target);
      const fallback = fallbackLesson(target, evidence.errors, evidence.exercises);
      const generated = await resolveGeneratedLesson({ aiService, target, fallback, logger });
      const { lesson, source } = generated;
      const formats = new Set(evidence.exercises.map((item) => item.question_format));
      const warnings = [...generated.warnings];
      if (evidence.exercises.length < 3) warnings.push("INSUFFICIENT_APPROVED_EXERCISES");
      if (formats.size < 2) warnings.push("LIMITED_FORMAT_DIVERSITY");
      return await persistLesson(studentId,target,plan.id,lesson,evidence.exercises,source,warnings);
    } catch (error) {
      await pool.query(
        `UPDATE remediation_plans SET status='TEACHER_REVIEW_REQUIRED',updated_at=NOW() WHERE id=$1`,
        [plan.id]
      );
      logger.error("Personalized lesson generation xatosi:", error.message);
      throw error;
    }
  }

  async function syncLessons(studentId) {
    const targets = await loadTargets(studentId);
    const created = [];
    for (const target of targets) {
      const lesson = await createForTarget(studentId, target);
      if (lesson) created.push(lesson);
    }
    return { created_count: created.length, target_count: targets.length };
  }

  async function listLessons(studentId) {
    const result = await pool.query(
      `SELECT l.id,l.status,l.progress_percent,l.quality_status,l.generation_source,l.lesson_content,
              l.created_at,l.started_at,l.completed_at,rp.status AS remediation_status,
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
       GROUP BY l.id,rp.status,t.id,t.name
       ORDER BY CASE l.status WHEN 'STARTED' THEN 1 WHEN 'ASSIGNED' THEN 2 ELSE 3 END,l.created_at DESC
       LIMIT 20`, [studentId]
    );
    return result.rows;
  }

  async function getLesson(studentId, lessonId) {
    const lesson = await pool.query(
      `SELECT l.*,rp.status AS remediation_status,t.name AS target_skill_name
       FROM personalized_lessons l JOIN remediation_plans rp ON rp.id=l.remediation_plan_id
       JOIN learning_taxonomy t ON t.id=l.taxonomy_id
       WHERE l.id=$1 AND l.student_id=$2 AND l.quality_status='APPROVED'`, [lessonId,studentId]
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
                (SELECT COUNT(*) FROM personalized_lesson_exercise_attempts a WHERE a.lesson_id=l.id AND a.student_id=$2) AS answered
         FROM personalized_lessons l WHERE l.id=$1 AND l.student_id=$2 FOR UPDATE`, [lessonId,studentId]
      );
      const lesson = result.rows[0];
      if (!lesson) { await client.query("ROLLBACK"); return null; }
      if (lesson.status === "COMPLETED") { await client.query("COMMIT"); return getLesson(studentId,lessonId); }
      if (Number(lesson.total) === 0 || Number(lesson.answered) < Number(lesson.total)) {
        await client.query("ROLLBACK"); return { incomplete: true, total: Number(lesson.total), answered: Number(lesson.answered) };
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
  LESSON_SCHEMA_VERSION,LESSON_PROMPT_VERSION,
  isApprovedExercise,makeExercises,fallbackLesson,normalizeAiLesson,resolveGeneratedLesson,
  createPersonalizedLessonService,
};
