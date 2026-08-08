-- Phase 13: persistent quality analytics, AI auditability and teacher controls.
-- Existing learning/remediation tables remain authoritative and are not duplicated.

CREATE TABLE IF NOT EXISTS question_quality_metrics (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  incorrect_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
  timeout_count INTEGER NOT NULL DEFAULT 0 CHECK (timeout_count >= 0),
  average_response_time_ms INTEGER CHECK (average_response_time_ms IS NULL OR average_response_time_ms >= 0),
  high_mastery_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (high_mastery_attempt_count >= 0),
  high_mastery_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (high_mastery_failure_count >= 0),
  metadata_mismatch_count INTEGER NOT NULL DEFAULT 0 CHECK (metadata_mismatch_count >= 0),
  option_selection_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_question_challenge NUMERIC(6,2)
    CHECK (observed_question_challenge IS NULL OR observed_question_challenge BETWEEN 0 AND 100),
  cohort_error_rate NUMERIC(6,2)
    CHECK (cohort_error_rate IS NULL OR cohort_error_rate BETWEEN 0 AND 100),
  cohort_average_response_time_ms INTEGER
    CHECK (cohort_average_response_time_ms IS NULL OR cohort_average_response_time_ms >= 0),
  evidence_sufficient BOOLEAN NOT NULL DEFAULT false,
  quality_status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY' CHECK (quality_status IN (
    'HEALTHY','REVIEW_SUGGESTED','POSSIBLY_AMBIGUOUS','POSSIBLE_WRONG_KEY',
    'LEVEL_MISMATCH','METADATA_MISMATCH','DISABLED'
  )),
  calculation_version VARCHAR(40) NOT NULL DEFAULT 'question_quality_v1',
  source_snapshot_hash VARCHAR(128),
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (correct_count + incorrect_count <= attempt_count),
  CHECK (high_mastery_failure_count <= high_mastery_attempt_count)
);

CREATE INDEX IF NOT EXISTS idx_question_quality_metrics_status
  ON question_quality_metrics(quality_status,evidence_sufficient,evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_quality_metrics_challenge
  ON question_quality_metrics(observed_question_challenge DESC)
  WHERE evidence_sufficient=true;

CREATE TABLE IF NOT EXISTS question_quality_flags (
  id BIGSERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  flag_code VARCHAR(80) NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','dismissed','resolved')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  detector_version VARCHAR(40) NOT NULL DEFAULT 'question_quality_v1',
  first_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (question_id,flag_code)
);

CREATE INDEX IF NOT EXISTS idx_question_quality_flags_open
  ON question_quality_flags(status,severity,last_detected_at DESC)
  WHERE status IN ('open','acknowledged');
CREATE INDEX IF NOT EXISTS idx_question_quality_flags_question
  ON question_quality_flags(question_id,status);

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id BIGSERIAL PRIMARY KEY,
  prompt_key VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  schema_version VARCHAR(50) NOT NULL,
  prompt_template TEXT NOT NULL,
  provider VARCHAR(60),
  model VARCHAR(120),
  checksum VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_key,version),
  UNIQUE (prompt_key,checksum)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_prompt_versions_active
  ON ai_prompt_versions(prompt_key) WHERE is_active=true;

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id BIGSERIAL PRIMARY KEY,
  generation_job_id BIGINT REFERENCES ai_generation_jobs(id) ON DELETE SET NULL,
  prompt_version_id BIGINT REFERENCES ai_prompt_versions(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'queued','started','provider_response','validation_failed','fallback_used',
    'retry_scheduled','completed','failed','cancelled'
  )),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  provider VARCHAR(60),
  model VARCHAR(120),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code VARCHAR(100),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_job
  ON ai_generation_logs(generation_job_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_failures
  ON ai_generation_logs(event_type,created_at DESC)
  WHERE event_type IN ('validation_failed','failed');

CREATE TABLE IF NOT EXISTS teacher_overrides (
  id BIGSERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  finding_id BIGINT REFERENCES learning_findings(id) ON DELETE SET NULL,
  override_type VARCHAR(40) NOT NULL CHECK (override_type IN (
    'FINDING_STATUS','MASTERY','LESSON_ASSIGNMENT','RETEST_SCHEDULE',
    'RECOMMENDATION_DISMISSAL','TOPIC_TAUGHT'
  )),
  previous_value JSONB,
  override_value JSONB NOT NULL,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (class_id IS NOT NULL OR student_id IS NOT NULL),
  CHECK (length(trim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_teacher_overrides_student_skill
  ON teacher_overrides(teacher_id,student_id,taxonomy_id,is_active,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_overrides_class_skill
  ON teacher_overrides(teacher_id,class_id,taxonomy_id,is_active,created_at DESC);

CREATE TABLE IF NOT EXISTS teacher_notes (
  id BIGSERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  note_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL' CHECK (note_type IN (
    'GENERAL','LEARNING_EVIDENCE','INTERVENTION','RETEST','FOLLOW_UP'
  )),
  note TEXT NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','class_staff')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (class_id IS NOT NULL OR student_id IS NOT NULL),
  CHECK (length(trim(note)) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_teacher_notes_student
  ON teacher_notes(teacher_id,student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_notes_class_skill
  ON teacher_notes(teacher_id,class_id,taxonomy_id,created_at DESC);

-- Join-supporting indexes for class heatmaps and production reporting.
CREATE INDEX IF NOT EXISTS idx_class_students_active_class_student
  ON class_students(class_id,student_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_student_skill_profiles_taxonomy_student
  ON student_skill_profiles(taxonomy_id,student_id,current_evidence_state);
CREATE INDEX IF NOT EXISTS idx_remediation_status_priority
  ON remediation_plans(status,priority DESC,updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_reports_student_period
  ON ai_reports(target_student_id,period_start DESC,report_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status
  ON ai_generation_jobs(status,run_after,created_at);
