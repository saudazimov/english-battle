BEGIN;

INSERT INTO remediation_history (
  remediation_plan_id, student_id, from_status, to_status, event_type, event_payload
)
SELECT plan.id,
       plan.student_id,
       plan.status,
       'TEACHER_REVIEW_REQUIRED',
       'LESSON_QUARANTINED',
       jsonb_build_object(
         'lesson_id', lesson.id,
         'reason', 'LEGACY_CANONICAL_EVIDENCE_MISSING',
         'preserved_lesson_status', lesson.status,
         'preserved_progress_percent', lesson.progress_percent
       )
FROM personalized_lessons lesson
JOIN remediation_plans plan ON plan.id=lesson.remediation_plan_id
WHERE lesson.quality_status='APPROVED'
  AND NULLIF(BTRIM(plan.evidence_snapshot->>'rule_signature'), '') IS NULL
  AND lesson.status<>'COMPLETED'
  AND lesson.completed_at IS NULL
  AND plan.status<>'TEACHER_REVIEW_REQUIRED'
  AND NOT EXISTS (
    SELECT 1
    FROM remediation_history history
    WHERE history.remediation_plan_id=plan.id
      AND history.event_type='LESSON_QUARANTINED'
      AND history.event_payload->>'reason'='LEGACY_CANONICAL_EVIDENCE_MISSING'
  );

UPDATE remediation_plans plan
SET status='TEACHER_REVIEW_REQUIRED',
    updated_at=NOW()
WHERE plan.status<>'TEACHER_REVIEW_REQUIRED'
  AND EXISTS (
    SELECT 1
    FROM personalized_lessons lesson
    WHERE lesson.remediation_plan_id=plan.id
      AND lesson.quality_status='APPROVED'
      AND NULLIF(BTRIM(plan.evidence_snapshot->>'rule_signature'), '') IS NULL
      AND lesson.status<>'COMPLETED'
      AND lesson.completed_at IS NULL
  );

UPDATE personalized_lessons lesson
SET quality_status='REVIEW_REQUIRED',
    quality_warnings=CASE
      WHEN lesson.quality_warnings @> '["LEGACY_CANONICAL_EVIDENCE_MISSING"]'::jsonb
        THEN lesson.quality_warnings
      ELSE lesson.quality_warnings || '["LEGACY_CANONICAL_EVIDENCE_MISSING"]'::jsonb
    END,
    updated_at=NOW()
FROM remediation_plans plan
WHERE plan.id=lesson.remediation_plan_id
  AND lesson.quality_status='APPROVED'
  AND NULLIF(BTRIM(plan.evidence_snapshot->>'rule_signature'), '') IS NULL;

DO $$
DECLARE
  unsafe_approved_count INTEGER;
  active_plan_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unsafe_approved_count
  FROM personalized_lessons lesson
  JOIN remediation_plans plan ON plan.id=lesson.remediation_plan_id
  WHERE lesson.quality_status='APPROVED'
    AND NULLIF(BTRIM(plan.evidence_snapshot->>'rule_signature'), '') IS NULL;

  SELECT COUNT(*)
  INTO active_plan_count
  FROM personalized_lessons lesson
  JOIN remediation_plans plan ON plan.id=lesson.remediation_plan_id
  WHERE lesson.quality_status='REVIEW_REQUIRED'
    AND lesson.quality_warnings @> '["LEGACY_CANONICAL_EVIDENCE_MISSING"]'::jsonb
    AND lesson.status<>'COMPLETED'
    AND lesson.completed_at IS NULL
    AND plan.status<>'TEACHER_REVIEW_REQUIRED';

  IF unsafe_approved_count <> 0 THEN
    RAISE EXCEPTION 'Expected no approved lessons without canonical evidence, found %',
      unsafe_approved_count;
  END IF;

  IF active_plan_count <> 0 THEN
    RAISE EXCEPTION 'Expected every active quarantined lesson plan to require review, found %',
      active_plan_count;
  END IF;
END $$;

COMMIT;
