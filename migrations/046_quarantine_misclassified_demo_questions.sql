-- Quarantine legacy demo questions that were incorrectly tagged as the
-- Present Simple third-person singular -s/-es/-ies micro-skill.

BEGIN;

CREATE TEMP TABLE misclassified_diagnostic_questions (
  question_text TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO misclassified_diagnostic_questions (question_text) VALUES
  ('My father _____ a farmer.'),
  ('He ___ like coffee.'),
  ('To ask price: ''___ much is it?'''),
  ('she _____ a teacher.'),
  ('She ___ a doctor in the future.');

WITH affected_lessons AS (
  SELECT DISTINCT l.id,l.remediation_plan_id
  FROM personalized_lessons l
  JOIN personalized_lesson_exercises e ON e.lesson_id=l.id
  JOIN questions q ON q.id=e.source_question_id
  JOIN misclassified_diagnostic_questions m
    ON LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
       = LOWER(REGEXP_REPLACE(TRIM(m.question_text),'\s+',' ','g'))
  WHERE l.progress_percent=0 AND l.status IN ('READY','ASSIGNED','STARTED')
), invalidated_lessons AS (
  UPDATE personalized_lessons l
  SET quality_status='REVIEW_REQUIRED',status='READY',
      quality_warnings=(COALESCE(l.quality_warnings,'[]'::jsonb)
        || '["MISCLASSIFIED_EXERCISE_REMOVED"]'::jsonb),updated_at=NOW()
  FROM affected_lessons a WHERE l.id=a.id
  RETURNING l.remediation_plan_id
)
UPDATE remediation_plans rp
SET status='TEACHER_REVIEW_REQUIRED',updated_at=NOW()
WHERE rp.id IN (SELECT remediation_plan_id FROM invalidated_lessons);

UPDATE questions q
SET diagnostic_eligible=false,analysis_status='REVIEW_REQUIRED',updated_at=NOW()
FROM misclassified_diagnostic_questions m
WHERE LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
      = LOWER(REGEXP_REPLACE(TRIM(m.question_text),'\s+',' ','g'));

UPDATE question_ai_analysis qa
SET status='REVIEW_REQUIRED',main_skill_id=NULL,topic_id=NULL,subskill_id=NULL,micro_skill_id=NULL,
    taxonomy_confidence=NULL,quality_warnings=(COALESCE(qa.quality_warnings,'[]'::jsonb)
      || '["TAXONOMY_MISMATCH_REQUIRES_REVIEW"]'::jsonb),
    diagnostic_eligible=false,provider='metadata-quarantine',model=NULL,
    last_error='Legacy demo taxonomy does not match the tested rule.',updated_at=NOW()
FROM questions q JOIN misclassified_diagnostic_questions m
  ON LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
     = LOWER(REGEXP_REPLACE(TRIM(m.question_text),'\s+',' ','g'))
WHERE qa.question_id=q.id;

DELETE FROM question_taxonomy_tags qt
USING questions q,misclassified_diagnostic_questions m
WHERE qt.question_id=q.id
  AND LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
      = LOWER(REGEXP_REPLACE(TRIM(m.question_text),'\s+',' ','g'));

DO $$
DECLARE approved_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT q.id) INTO approved_count
  FROM questions q
  JOIN question_taxonomy_tags qt ON qt.question_id=q.id
  JOIN learning_taxonomy t ON t.id=qt.taxonomy_id
  JOIN question_ai_analysis qa ON qa.question_id=q.id
  WHERE t.slug='selecting-s-es-ies' AND qt.tag_role='micro_skill'
    AND q.status='published' AND q.diagnostic_eligible=true AND qa.diagnostic_eligible=true
    AND q.cefr_level='A1';
  IF approved_count < 10 THEN
    RAISE EXCEPTION 'Quarantine left fewer than 10 valid Present Simple remediation questions: %', approved_count;
  END IF;
END $$;

COMMIT;
