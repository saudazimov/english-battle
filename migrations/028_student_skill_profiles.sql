-- Phase 4: deterministic per-student taxonomy mastery profiles.
-- Official scores are calculated by application code from diagnostically reliable
-- answer events. Configuration is stored here so weights can be changed without
-- embedding business thresholds in controllers.

CREATE TABLE IF NOT EXISTS system_learning_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO system_learning_settings (setting_key, setting_value, description)
VALUES
  ('mastery_model_v1', '{"weighted_accuracy":0.80,"transfer_bonus_max":6,"format_variety_bonus_max":4,"delayed_retention_bonus_max":5,"stable_response_bonus_max":5,"hint_penalty_max":6,"repeated_error_penalty_max":12,"regression_penalty":15,"expected_response_time_ms":20000}', '0-100 deterministic mastery weights'),
  ('confidence_model_v1', '{"attempts_max":30,"unique_questions_max":25,"sessions_max":15,"formats_max":10,"analysis_quality_max":10,"recency_max":5,"consistency_max":5,"attempt_target":20,"question_target":12,"session_target":6,"format_target":4}', '0-100 evidence confidence weights'),
  ('evidence_state_v1', '{"suspected_errors":2,"likely_errors":3,"likely_questions":3,"confirmed_errors":3,"confirmed_sessions":2,"confirmed_formats":2,"confirmed_confidence":40,"regression_recent_attempts":5,"regression_recent_accuracy":50}', 'Configurable evidence-state thresholds'),
  ('priority_model_v1', '{"confidence_floor":0.35,"error_floor":0.40,"recurrence_floor":0.40,"prerequisite_default":0.70,"recency_decay_days":45}', 'Weakness priority factors')
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS student_skill_profiles (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  taxonomy_level VARCHAR(20) NOT NULL,
  exposure_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  timeout_count INTEGER NOT NULL DEFAULT 0,
  distinct_question_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  format_count INTEGER NOT NULL DEFAULT 0,
  weighted_accuracy NUMERIC(6,2) NOT NULL DEFAULT 0,
  error_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  average_response_time_ms INTEGER,
  expected_response_time_ms INTEGER NOT NULL DEFAULT 20000,
  hint_usage_count INTEGER NOT NULL DEFAULT 0,
  hint_usage_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  repeated_misconception_count INTEGER NOT NULL DEFAULT 0,
  analysis_quality NUMERIC(6,4) NOT NULL DEFAULT 0,
  mastery_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  confidence_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  confidence_label VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (confidence_label IN ('low','medium','high')),
  retention_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  current_evidence_state VARCHAR(20) NOT NULL DEFAULT 'OBSERVED'
    CHECK (current_evidence_state IN ('OBSERVED','SUSPECTED','LIKELY','CONFIRMED','REMEDIATING','IMPROVING','STABLE','MASTERED','REGRESSED')),
  last_attempt TIMESTAMP,
  last_correct_attempt TIMESTAMP,
  last_incorrect_attempt TIMESTAMP,
  last_lesson_date TIMESTAMP,
  next_review_date TIMESTAMP,
  regression_flag BOOLEAN NOT NULL DEFAULT false,
  prerequisite_gap_flag BOOLEAN NOT NULL DEFAULT false,
  current_priority NUMERIC(6,2) NOT NULL DEFAULT 0,
  profile_version VARCHAR(30) NOT NULL DEFAULT 'skill_profile_v1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, taxonomy_id),
  CHECK (exposure_count >= 0 AND correct_count >= 0 AND incorrect_count >= 0),
  CHECK (mastery_score BETWEEN 0 AND 100),
  CHECK (confidence_score BETWEEN 0 AND 100),
  CHECK (current_priority BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_student_skill_profiles_priority
  ON student_skill_profiles(student_id, current_priority DESC);
CREATE INDEX IF NOT EXISTS idx_student_skill_profiles_state
  ON student_skill_profiles(current_evidence_state, taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_student_skill_profiles_review
  ON student_skill_profiles(student_id, next_review_date)
  WHERE next_review_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS mastery_history (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  trigger_answer_event_id BIGINT REFERENCES student_answer_events(id) ON DELETE SET NULL,
  previous_mastery_score NUMERIC(6,2),
  mastery_score NUMERIC(6,2) NOT NULL,
  confidence_score NUMERIC(6,2) NOT NULL,
  previous_evidence_state VARCHAR(20),
  evidence_state VARCHAR(20) NOT NULL,
  calculation_version VARCHAR(30) NOT NULL DEFAULT 'skill_profile_v1',
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mastery_history_student_skill
  ON mastery_history(student_id, taxonomy_id, created_at DESC);

-- Queue a rebuild for every historical student/taxonomy pair. The worker uses
-- the same durable queue and SKIP LOCKED semantics as question analysis.
INSERT INTO ai_generation_jobs (
  job_type, entity_type, entity_id, payload, idempotency_key
)
SELECT DISTINCT
  'skill_profile_rebuild', 'student_skill',
  e.student_id::text || ':' || taxonomy.taxonomy_id::text,
  jsonb_build_object('student_id', e.student_id, 'taxonomy_id', taxonomy.taxonomy_id, 'reason', 'phase4_backfill'),
  'skill-profile:v1:backfill:' || e.student_id::text || ':' || taxonomy.taxonomy_id::text
FROM student_answer_events e
CROSS JOIN LATERAL (
  VALUES (e.main_skill_id), (e.topic_id), (e.subskill_id), (e.micro_skill_id)
) AS taxonomy(taxonomy_id)
WHERE e.question_diagnostic_eligible=true AND taxonomy.taxonomy_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;
