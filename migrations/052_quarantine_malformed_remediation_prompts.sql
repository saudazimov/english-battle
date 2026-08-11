BEGIN;

CREATE TEMP TABLE malformed_remediation_questions (
  question_id BIGINT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO malformed_remediation_questions (question_id)
SELECT q.id
FROM questions q
JOIN question_ai_analysis qa ON qa.question_id=q.id
WHERE q.diagnostic_eligible=true
  AND qa.diagnostic_eligible=true
  AND (
    (qa.question_type='gap_fill' AND POSITION('___' IN q.question_text)=0)
    OR (
      POSITION('_' IN q.question_text)>0
      AND (
        ((LENGTH(q.question_text)-LENGTH(REPLACE(q.question_text,'___',''))) / 3) <> 1
        OR POSITION('_' IN REPLACE(q.question_text,'___',''))>0
        OR q.question_text ~ '[[:alnum:]]___|___[[:alnum:]]'
      )
    )
  );

CREATE TEMP TABLE malformed_prompt_lessons (
  lesson_id BIGINT PRIMARY KEY,
  remediation_plan_id BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO malformed_prompt_lessons (lesson_id,remediation_plan_id)
SELECT DISTINCT lesson.id,lesson.remediation_plan_id
FROM personalized_lessons lesson
JOIN personalized_lesson_exercises exercise ON exercise.lesson_id=lesson.id
JOIN malformed_remediation_questions invalid ON invalid.question_id=exercise.source_question_id
WHERE lesson.quality_status='APPROVED'
  AND lesson.progress_percent=0
  AND lesson.status IN ('READY','ASSIGNED','STARTED')
  AND lesson.completed_at IS NULL;

INSERT INTO remediation_history (
  remediation_plan_id,student_id,from_status,to_status,event_type,event_payload
)
SELECT plan.id,plan.student_id,plan.status,'TEACHER_REVIEW_REQUIRED',
       'LESSON_QUARANTINED',
       jsonb_build_object(
         'lesson_id',invalid.lesson_id,
         'reason','MALFORMED_EXERCISE_PROMPT',
         'preserved_lesson_status',lesson.status,
         'preserved_progress_percent',lesson.progress_percent
       )
FROM malformed_prompt_lessons invalid
JOIN personalized_lessons lesson ON lesson.id=invalid.lesson_id
JOIN remediation_plans plan ON plan.id=invalid.remediation_plan_id
WHERE NOT EXISTS (
  SELECT 1 FROM remediation_history history
  WHERE history.remediation_plan_id=plan.id
    AND history.event_type='LESSON_QUARANTINED'
    AND history.event_payload->>'lesson_id'=invalid.lesson_id::text
    AND history.event_payload->>'reason'='MALFORMED_EXERCISE_PROMPT'
);

UPDATE personalized_lessons lesson
SET quality_status='REVIEW_REQUIRED',status='READY',progress_percent=0,
    quality_warnings=CASE
      WHEN COALESCE(lesson.quality_warnings,'[]'::jsonb)
        @> '["MALFORMED_EXERCISE_PROMPT"]'::jsonb
        THEN COALESCE(lesson.quality_warnings,'[]'::jsonb)
      ELSE COALESCE(lesson.quality_warnings,'[]'::jsonb)
        || '["MALFORMED_EXERCISE_PROMPT"]'::jsonb
    END,
    started_at=NULL,updated_at=NOW()
FROM malformed_prompt_lessons invalid
WHERE lesson.id=invalid.lesson_id;

UPDATE remediation_plans plan
SET status='TEACHER_REVIEW_REQUIRED',updated_at=NOW()
WHERE plan.id IN (SELECT remediation_plan_id FROM malformed_prompt_lessons);

UPDATE questions question
SET diagnostic_eligible=false,analysis_status='REVIEW_REQUIRED',updated_at=NOW()
WHERE question.id IN (SELECT question_id FROM malformed_remediation_questions);

UPDATE question_ai_analysis analysis
SET status='REVIEW_REQUIRED',diagnostic_eligible=false,
    quality_warnings=CASE
      WHEN COALESCE(analysis.quality_warnings,'[]'::jsonb)
        @> '["MALFORMED_QUESTION_PROMPT"]'::jsonb
        THEN COALESCE(analysis.quality_warnings,'[]'::jsonb)
      ELSE COALESCE(analysis.quality_warnings,'[]'::jsonb)
        || '["MALFORMED_QUESTION_PROMPT"]'::jsonb
    END,
    last_error='Question prompt failed deterministic blank-format validation.',
    updated_at=NOW()
WHERE analysis.question_id IN (SELECT question_id FROM malformed_remediation_questions);

DO $$
DECLARE
  unsafe_question_count INTEGER;
  unsafe_lesson_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unsafe_question_count
  FROM questions question
  JOIN malformed_remediation_questions invalid ON invalid.question_id=question.id
  WHERE question.diagnostic_eligible=true;

  SELECT COUNT(*) INTO unsafe_lesson_count
  FROM personalized_lessons lesson
  JOIN malformed_prompt_lessons invalid ON invalid.lesson_id=lesson.id
  WHERE lesson.quality_status='APPROVED';

  IF unsafe_question_count <> 0 THEN
    RAISE EXCEPTION 'Expected no malformed diagnostic questions, found %',unsafe_question_count;
  END IF;
  IF unsafe_lesson_count <> 0 THEN
    RAISE EXCEPTION 'Expected no approved malformed lessons, found %',unsafe_lesson_count;
  END IF;
END $$;

COMMIT;
