-- Phase 8: targeted retests, spaced review attempts, reminders and retention.

INSERT INTO system_learning_settings (setting_key, setting_value, description)
VALUES (
  'retest_review_v1',
  '{"question_count":10,"required_correct":8,"required_successful_retests":2,"review_days":[0,1,3,7,21],"minimum_formats":2,"retention_weight":0.4,"failed_review_threshold":2}',
  'Deterministic targeted retest and spaced review defaults'
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS targeted_retests (
  id BIGSERIAL PRIMARY KEY,
  remediation_plan_id BIGINT NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  assessment_type VARCHAR(12) NOT NULL CHECK (assessment_type IN ('RETEST','REVIEW')),
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  schema_version VARCHAR(40) NOT NULL DEFAULT 'targeted_retest_v1',
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','READY','STARTED','COMPLETED','REVIEW_REQUIRED','CANCELLED')),
  quality_status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (quality_status IN ('PENDING','APPROVED','REVIEW_REQUIRED')),
  quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_for TIMESTAMP NOT NULL DEFAULT NOW(),
  question_count INTEGER NOT NULL DEFAULT 10 CHECK (question_count > 0),
  required_correct INTEGER NOT NULL DEFAULT 8 CHECK (required_correct > 0),
  notification_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (remediation_plan_id, assessment_type, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_targeted_retests_student_due
  ON targeted_retests(student_id,status,scheduled_for);
CREATE INDEX IF NOT EXISTS idx_targeted_retests_plan
  ON targeted_retests(remediation_plan_id,assessment_type,sequence_no);

CREATE TABLE IF NOT EXISTS targeted_retest_questions (
  id BIGSERIAL PRIMARY KEY,
  targeted_retest_id BIGINT NOT NULL REFERENCES targeted_retests(id) ON DELETE CASCADE,
  source_question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  question_format VARCHAR(80) NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option VARCHAR(10) NOT NULL,
  explanation TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (targeted_retest_id, source_question_id),
  UNIQUE (targeted_retest_id, position)
);

CREATE TABLE IF NOT EXISTS retest_attempts (
  id BIGSERIAL PRIMARY KEY,
  targeted_retest_id BIGINT NOT NULL UNIQUE REFERENCES targeted_retests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  correct_count INTEGER CHECK (correct_count >= 0),
  total_count INTEGER CHECK (total_count > 0),
  accuracy NUMERIC(6,2) CHECK (accuracy BETWEEN 0 AND 100),
  passed BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retest_attempt_answers (
  id BIGSERIAL PRIMARY KEY,
  retest_attempt_id BIGINT NOT NULL REFERENCES retest_attempts(id) ON DELETE CASCADE,
  assessment_question_id BIGINT NOT NULL REFERENCES targeted_retest_questions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_option VARCHAR(10) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_time_ms INTEGER CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  answered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (retest_attempt_id, assessment_question_id)
);

CREATE TABLE IF NOT EXISTS review_schedules (
  id BIGSERIAL PRIMARY KEY,
  remediation_plan_id BIGINT NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  interval_days INTEGER NOT NULL CHECK (interval_days >= 0),
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','DUE','COMPLETED','CANCELLED')),
  targeted_retest_id BIGINT UNIQUE REFERENCES targeted_retests(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (remediation_plan_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_review_schedules_student_due
  ON review_schedules(student_id,status,scheduled_for);
CREATE INDEX IF NOT EXISTS idx_review_schedules_global_due
  ON review_schedules(status,scheduled_for);
