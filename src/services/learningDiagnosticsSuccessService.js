const {
  DEMO_CLASS_CODE,
  DEMO_MARKER,
  DEMO_USERNAME_PREFIX,
  DEMO_VERSION,
} = require("./learningDiagnosticsDemoService");

const SUCCESS_CRITERIA = Object.freeze([
  "Admin minimal question entry is persisted",
  "Question is saved independently of analysis",
  "Level, taxonomy, distractors and quality are analyzed",
  "Question reaches READY or REVIEW_REQUIRED",
  "Questions flow through battle, practice, assignment and exam",
  "Detailed answer events are stored",
  "Question metadata is attached to attempts",
  "Skill statistics are updated",
  "Recurring misconceptions are detected",
  "Weakness moves through evidence states",
  "Old report cache becomes stale",
  "A fresh student report is generated",
  "A personalized or fallback lesson exists",
  "Student completes the lesson",
  "Targeted retests use ten new questions",
  "Student completes targeted retests",
  "Mastery and confidence are updated",
  "1, 3, 7 and 21 day reviews are scheduled",
  "Review reminders are persisted",
  "Review results update retention",
  "Skill reaches improving, stable, mastered or regressed",
  "Teacher-owned class exposes evidence and progress",
  "Class shared-weakness analytics have evidence",
  "The loop works with AI fallback",
  "Demo evidence stays isolated from existing gameplay",
]);

const EVIDENCE_SQL = `
  WITH demo_users AS (
    SELECT id,role,username FROM users WHERE username LIKE $1
  ), demo_students AS (
    SELECT id,username FROM demo_users WHERE role='student'
  ), demo_questions AS (
    SELECT * FROM questions WHERE explanation LIKE $2
  ), demo_class AS (
    SELECT * FROM classes WHERE join_code=$3
  ), demo_answers AS (
    SELECT e.* FROM student_answer_events e JOIN demo_students s ON s.id=e.student_id
  ), demo_plans AS (
    SELECT p.* FROM remediation_plans p JOIN demo_students s ON s.id=p.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM demo_students)::int AS student_count,
    (SELECT COUNT(*) FROM demo_questions)::int AS question_count,
    (SELECT COUNT(*) FROM demo_questions WHERE length(trim(question_text))>0
      AND length(trim(option_a))>0 AND length(trim(option_b))>0
      AND length(trim(option_c))>0 AND length(trim(option_d))>0
      AND correct_option IS NOT NULL)::int AS minimal_question_count,
    (SELECT COUNT(*) FROM question_ai_analysis a JOIN demo_questions q ON q.id=a.question_id
      WHERE a.estimated_level IS NOT NULL AND a.main_skill_id IS NOT NULL
        AND a.topic_id IS NOT NULL AND a.subskill_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM question_distractor_analysis d WHERE d.question_id=q.id)
    )::int AS analyzed_question_count,
    (SELECT COUNT(*) FROM demo_questions WHERE analysis_status IN ('READY','REVIEW_REQUIRED'))::int AS processed_question_count,
    ARRAY(SELECT DISTINCT source_mode FROM demo_answers ORDER BY source_mode) AS source_modes,
    (SELECT COUNT(*) FROM demo_answers)::int AS answer_count,
    (SELECT COUNT(*) FROM demo_answers WHERE source_record_id IS NOT NULL
      AND source_question_id IS NOT NULL AND correct_option IS NOT NULL
      AND response_time_ms IS NOT NULL AND idempotency_key IS NOT NULL)::int AS detailed_answer_count,
    (SELECT COUNT(*) FROM demo_answers WHERE main_skill_id IS NOT NULL AND topic_id IS NOT NULL
      AND subskill_id IS NOT NULL AND question_analysis_version IS NOT NULL
      AND question_diagnostic_eligible=true)::int AS metadata_answer_count,
    (SELECT COUNT(*) FROM student_skill_profiles p JOIN demo_students s ON s.id=p.student_id
      WHERE p.exposure_count>0 AND p.confidence_score>0)::int AS profile_count,
    (SELECT COUNT(*) FROM learning_findings f JOIN demo_students s ON s.id=f.student_id
      WHERE f.occurrence_count>=3 AND f.confidence>=0.4)::int AS recurring_finding_count,
    ARRAY(SELECT DISTINCT state FROM (
      SELECT current_evidence_state AS state FROM student_skill_profiles p JOIN demo_students s ON s.id=p.student_id
      UNION SELECT evidence_state FROM mastery_history h JOIN demo_students s ON s.id=h.student_id
    ) states ORDER BY state) AS evidence_states,
    (SELECT COUNT(*) FROM ai_reports r JOIN demo_students s ON s.id=r.target_student_id
      WHERE r.is_stale=true AND r.source_snapshot_hash=$4)::int AS stale_report_count,
    (SELECT COUNT(*) FROM ai_reports r JOIN demo_students s ON s.id=r.target_student_id
      WHERE r.is_stale=false AND r.source_snapshot_hash=$5)::int AS fresh_report_count,
    (SELECT COUNT(*) FROM personalized_lessons l JOIN demo_students s ON s.id=l.student_id
      WHERE l.generation_source IN ('ai','fallback','template'))::int AS lesson_count,
    (SELECT COUNT(*) FROM personalized_lessons l JOIN demo_students s ON s.id=l.student_id
      WHERE l.status='COMPLETED' AND l.progress_percent=100)::int AS completed_lesson_count,
    (SELECT COUNT(*) FROM personalized_lesson_exercise_attempts a JOIN demo_students s ON s.id=a.student_id)::int AS lesson_attempt_count,
    (SELECT COUNT(*) FROM targeted_retests r JOIN demo_students s ON s.id=r.student_id
      WHERE (SELECT COUNT(*) FROM targeted_retest_questions q WHERE q.targeted_retest_id=r.id)=10
    )::int AS ten_question_assessment_count,
    (SELECT COUNT(*) FROM targeted_retests r JOIN demo_students s ON s.id=r.student_id
      JOIN retest_attempts a ON a.targeted_retest_id=r.id
      WHERE r.status='COMPLETED' AND a.completed_at IS NOT NULL)::int AS completed_assessment_count,
    (SELECT COUNT(*) FROM mastery_history h JOIN demo_students s ON s.id=h.student_id
      WHERE h.mastery_score>=0 AND h.confidence_score>0)::int AS mastery_update_count,
    ARRAY(SELECT DISTINCT interval_days FROM review_schedules r JOIN demo_students s ON s.id=r.student_id
      WHERE interval_days IN (1,3,7,21) ORDER BY interval_days) AS review_intervals,
    (SELECT COUNT(*) FROM review_schedules r JOIN demo_students s ON s.id=r.student_id
      WHERE r.interval_days=21 AND r.status='PENDING')::int AS pending_21_day_count,
    (SELECT COUNT(*) FROM notifications n JOIN demo_students s ON s.id=n.user_id
      WHERE n.type='learning_review_due')::int AS reminder_count,
    (SELECT COUNT(*) FROM targeted_retests r JOIN demo_students s ON s.id=r.student_id
      JOIN retest_attempts a ON a.targeted_retest_id=r.id
      WHERE r.assessment_type='REVIEW' AND a.completed_at IS NOT NULL)::int AS completed_review_count,
    (SELECT COUNT(*) FROM student_skill_profiles p JOIN demo_students s ON s.id=p.student_id
      WHERE p.retention_score>0)::int AS retention_profile_count,
    ARRAY(SELECT DISTINCT evidence_state FROM mastery_history h JOIN demo_students s ON s.id=h.student_id
      WHERE evidence_state IN ('IMPROVING','STABLE','MASTERED','REGRESSED') ORDER BY evidence_state) AS outcome_states,
    (SELECT COUNT(*) FROM class_students cs JOIN demo_students s ON s.id=cs.student_id
      JOIN demo_class c ON c.id=cs.class_id
      JOIN users teacher ON teacher.id=c.teacher_id AND teacher.role='teacher'
      JOIN learning_findings f ON f.student_id=s.id
      WHERE cs.status='active')::int AS teacher_evidence_count,
    (SELECT COUNT(*) FROM class_students cs JOIN demo_students s ON s.id=cs.student_id
      JOIN demo_class c ON c.id=cs.class_id
      JOIN student_skill_profiles p ON p.student_id=s.id
      JOIN learning_taxonomy t ON t.id=p.taxonomy_id
      WHERE cs.status='active' AND t.slug='selecting-s-es-ies')::int AS shared_weakness_count,
    (SELECT COUNT(*) FROM personalized_lessons l JOIN demo_students s ON s.id=l.student_id
      WHERE l.generation_source='fallback')::int AS fallback_lesson_count,
    (SELECT COUNT(DISTINCT g.event_type) FROM ai_generation_logs g
      JOIN ai_generation_jobs j ON j.id=g.generation_job_id
      WHERE j.idempotency_key LIKE $6 AND g.event_type IN ('failed','fallback_used'))::int AS fallback_event_count,
    (SELECT COUNT(*) FROM demo_questions WHERE status='draft')::int AS isolated_question_count,
    (SELECT COUNT(*) FROM demo_plans)::int AS plan_count
`;

function includesEvery(values, required) {
  const available = new Set(values || []);
  return required.every((value) => available.has(value));
}

function criterion(id, passed, description, evidence) {
  return { id, key: `SC-${String(id).padStart(2, "0")}`, passed: Boolean(passed), description, evidence };
}

function buildSuccessCriteria(evidence) {
  const questions = Number(evidence.question_count);
  const answers = Number(evidence.answer_count);
  const criteria = [
    criterion(1, Number(evidence.minimal_question_count) >= 1, SUCCESS_CRITERIA[0], `${evidence.minimal_question_count} complete base question(s)`),
    criterion(2, questions >= 24, SUCCESS_CRITERIA[1], `${questions} persisted draft question(s)`),
    criterion(3, Number(evidence.analyzed_question_count) === questions, SUCCESS_CRITERIA[2], `${evidence.analyzed_question_count}/${questions} analyzed`),
    criterion(4, Number(evidence.processed_question_count) === questions, SUCCESS_CRITERIA[3], `${evidence.processed_question_count}/${questions} finalized`),
    criterion(5, includesEvery(evidence.source_modes, ["battle", "practice", "teacher_assignment", "class_exam"]), SUCCESS_CRITERIA[4], evidence.source_modes),
    criterion(6, answers > 0 && Number(evidence.detailed_answer_count) === answers, SUCCESS_CRITERIA[5], `${evidence.detailed_answer_count}/${answers} detailed`),
    criterion(7, answers > 0 && Number(evidence.metadata_answer_count) === answers, SUCCESS_CRITERIA[6], `${evidence.metadata_answer_count}/${answers} enriched`),
    criterion(8, Number(evidence.profile_count) === Number(evidence.student_count), SUCCESS_CRITERIA[7], `${evidence.profile_count} profile(s)`),
    criterion(9, Number(evidence.recurring_finding_count) >= 6, SUCCESS_CRITERIA[8], `${evidence.recurring_finding_count} recurring finding(s)`),
    criterion(10, includesEvery(evidence.evidence_states, ["CONFIRMED", "IMPROVING", "STABLE"]), SUCCESS_CRITERIA[9], evidence.evidence_states),
    criterion(11, Number(evidence.stale_report_count) >= 1, SUCCESS_CRITERIA[10], `${evidence.stale_report_count} stale report(s)`),
    criterion(12, Number(evidence.fresh_report_count) >= 1, SUCCESS_CRITERIA[11], `${evidence.fresh_report_count} fresh report(s)`),
    criterion(13, Number(evidence.lesson_count) >= 2, SUCCESS_CRITERIA[12], `${evidence.lesson_count} lesson(s)`),
    criterion(14, Number(evidence.completed_lesson_count) >= 2 && Number(evidence.lesson_attempt_count) >= 6, SUCCESS_CRITERIA[13], `${evidence.completed_lesson_count} completed, ${evidence.lesson_attempt_count} answer(s)`),
    criterion(15, Number(evidence.ten_question_assessment_count) >= 8, SUCCESS_CRITERIA[14], `${evidence.ten_question_assessment_count} validated assessment(s)`),
    criterion(16, Number(evidence.completed_assessment_count) >= 8, SUCCESS_CRITERIA[15], `${evidence.completed_assessment_count} completed assessment(s)`),
    criterion(17, Number(evidence.mastery_update_count) >= 13, SUCCESS_CRITERIA[16], `${evidence.mastery_update_count} mastery update(s)`),
    criterion(18, includesEvery((evidence.review_intervals || []).map(Number), [1, 3, 7, 21]) && Number(evidence.pending_21_day_count) >= 2, SUCCESS_CRITERIA[17], evidence.review_intervals),
    criterion(19, Number(evidence.reminder_count) >= 2, SUCCESS_CRITERIA[18], `${evidence.reminder_count} reminder(s)`),
    criterion(20, Number(evidence.completed_review_count) >= 6 && Number(evidence.retention_profile_count) >= 2, SUCCESS_CRITERIA[19], `${evidence.completed_review_count} review(s), ${evidence.retention_profile_count} retained profile(s)`),
    criterion(21, includesEvery(evidence.outcome_states, ["IMPROVING", "STABLE", "MASTERED", "REGRESSED"]), SUCCESS_CRITERIA[20], evidence.outcome_states),
    criterion(22, Number(evidence.teacher_evidence_count) >= 6, SUCCESS_CRITERIA[21], `${evidence.teacher_evidence_count} teacher-visible finding(s)`),
    criterion(23, Number(evidence.shared_weakness_count) >= 3, SUCCESS_CRITERIA[22], `${evidence.shared_weakness_count} shared profile(s)`),
    criterion(24, Number(evidence.fallback_lesson_count) >= 1 && Number(evidence.fallback_event_count) === 2, SUCCESS_CRITERIA[23], `${evidence.fallback_lesson_count} fallback lesson(s), ${evidence.fallback_event_count} audit event type(s)`),
    criterion(25, questions > 0 && Number(evidence.isolated_question_count) === questions && Number(evidence.plan_count) === 2, SUCCESS_CRITERIA[24], `${evidence.isolated_question_count}/${questions} isolated draft question(s)`),
  ];
  return criteria;
}

function createLearningDiagnosticsSuccessService({ pool }) {
  return {
    async verify() {
      const result = await pool.query(EVIDENCE_SQL, [
        `${DEMO_USERNAME_PREFIX}%`,
        `${DEMO_MARKER}%`,
        DEMO_CLASS_CODE,
        `${DEMO_VERSION}:stale`,
        `${DEMO_VERSION}:fresh`,
        `${DEMO_VERSION}:%`,
      ]);
      const evidence = result.rows[0] || {};
      const criteria = buildSuccessCriteria(evidence);
      return {
        passed: criteria.every((item) => item.passed),
        passedCount: criteria.filter((item) => item.passed).length,
        totalCount: criteria.length,
        criteria,
      };
    },
  };
}

module.exports = {
  SUCCESS_CRITERIA,
  buildSuccessCriteria,
  createLearningDiagnosticsSuccessService,
};
