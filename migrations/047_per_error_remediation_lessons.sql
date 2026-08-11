-- One independently resumable lesson per concrete incorrect answer event.

ALTER TABLE remediation_plans
  ADD COLUMN IF NOT EXISTS source_answer_event_id BIGINT
    REFERENCES student_answer_events(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS uq_remediation_active_student_skill;

CREATE UNIQUE INDEX IF NOT EXISTS uq_remediation_active_student_skill_legacy
  ON remediation_plans(student_id,taxonomy_id)
  WHERE source_answer_event_id IS NULL AND status NOT IN ('STABLE','MASTERED');

CREATE UNIQUE INDEX IF NOT EXISTS uq_remediation_active_student_error
  ON remediation_plans(student_id,source_answer_event_id)
  WHERE source_answer_event_id IS NOT NULL AND status NOT IN ('STABLE','MASTERED');

CREATE INDEX IF NOT EXISTS idx_remediation_student_error
  ON remediation_plans(student_id,source_answer_event_id,created_at DESC)
  WHERE source_answer_event_id IS NOT NULL;
