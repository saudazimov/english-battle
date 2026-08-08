-- Phase 5: deterministic error classification and structured learning findings.

INSERT INTO system_learning_settings (setting_key, setting_value, description)
VALUES (
  'pattern_detection_v1',
  '{"repeated_error_min":3,"repeated_distractor_min":2,"timeout_min":2,"fast_error_min":2,"fast_response_ratio":0.25,"comparison_min_attempts":3,"accuracy_gap":35,"weak_accuracy":50,"strong_accuracy":75,"prerequisite_mastery":60,"prerequisite_confidence":40}',
  'Deterministic pattern thresholds; scores remain independent from AI'
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS student_error_events (
  id BIGSERIAL PRIMARY KEY,
  answer_event_id BIGINT NOT NULL UNIQUE REFERENCES student_answer_events(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  system_classification VARCHAR(50) NOT NULL,
  ai_interpretation VARCHAR(50),
  final_classification VARCHAR(50) NOT NULL,
  classification_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  classifier_version VARCHAR(40) NOT NULL DEFAULT 'pattern_detection_v1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (system_classification IN (
    'KNOWLEDGE_GAP','MISCONCEPTION','PARTIAL_UNDERSTANDING','VOCABULARY_GAP',
    'READING_COMPREHENSION_GAP','INSTRUCTION_MISREAD','CARELESS_ERROR',
    'TIME_PRESSURE_ERROR','GUESSING','QUESTION_FORMAT_WEAKNESS',
    'PREREQUISITE_GAP','REPEATED_ERROR','UNKNOWN'
  )),
  CHECK (final_classification IN (
    'KNOWLEDGE_GAP','MISCONCEPTION','PARTIAL_UNDERSTANDING','VOCABULARY_GAP',
    'READING_COMPREHENSION_GAP','INSTRUCTION_MISREAD','CARELESS_ERROR',
    'TIME_PRESSURE_ERROR','GUESSING','QUESTION_FORMAT_WEAKNESS',
    'PREREQUISITE_GAP','REPEATED_ERROR','UNKNOWN'
  )),
  CHECK (classification_confidence BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_student_error_events_student_skill
  ON student_error_events(student_id, taxonomy_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_error_events_classification
  ON student_error_events(final_classification, updated_at DESC);

CREATE TABLE IF NOT EXISTS learning_findings (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  finding_code VARCHAR(160) NOT NULL,
  finding_type VARCHAR(60) NOT NULL,
  error_classification VARCHAR(50),
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  evidence_state VARCHAR(20) NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommended_action VARCHAR(60) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  detector_version VARCHAR(40) NOT NULL DEFAULT 'pattern_detection_v1',
  first_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, taxonomy_id, finding_code),
  CHECK (confidence BETWEEN 0 AND 1),
  CHECK (occurrence_count >= 0),
  CHECK (evidence_state IN ('OBSERVED','SUSPECTED','LIKELY','CONFIRMED','REMEDIATING','IMPROVING','STABLE','MASTERED','REGRESSED'))
);

CREATE INDEX IF NOT EXISTS idx_learning_findings_student_active
  ON learning_findings(student_id, is_active, severity, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learning_findings_skill
  ON learning_findings(taxonomy_id, is_active, finding_type);

ALTER TABLE student_skill_profiles
  ADD COLUMN IF NOT EXISTS dominant_error_classification VARCHAR(50),
  ADD COLUMN IF NOT EXISTS active_finding_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pattern_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO ai_generation_jobs (job_type, entity_type, entity_id, payload, idempotency_key)
SELECT 'skill_profile_rebuild',
       'student_skill', p.student_id::text || ':' || p.taxonomy_id::text,
       jsonb_build_object('student_id',p.student_id,'taxonomy_id',p.taxonomy_id,'reason','phase5_backfill'),
       'skill-profile:pattern-v1:backfill:' || p.student_id::text || ':' || p.taxonomy_id::text
FROM student_skill_profiles p
ON CONFLICT (idempotency_key) DO NOTHING;
