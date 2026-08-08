-- Phase 7: persistent personalized remediation lessons and exercise progress.

INSERT INTO system_learning_settings (setting_key, setting_value, description)
VALUES (
  'personalized_lesson_v1',
  '{"max_active_lessons":3,"minimum_exercises":3,"mastery_required_correct":8,"mastery_total_questions":10,"mastery_successful_attempts":2,"review_days":[0,1,3,7,21]}',
  'Personalized remediation lesson and future retest defaults'
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS remediation_plans (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  source_finding_id BIGINT REFERENCES learning_findings(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','GENERATING','READY','ASSIGNED','STARTED','COMPLETED','RETEST_PENDING',
    'RETEST_FAILED','REVIEW_PENDING','IMPROVING','STABLE','MASTERED','REGRESSED',
    'TEACHER_REVIEW_REQUIRED'
  )),
  priority NUMERIC(6,2) NOT NULL DEFAULT 0,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_version VARCHAR(40) NOT NULL DEFAULT 'remediation_plan_v1',
  assigned_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_remediation_active_student_skill
  ON remediation_plans(student_id,taxonomy_id)
  WHERE status NOT IN ('STABLE','MASTERED');
CREATE INDEX IF NOT EXISTS idx_remediation_student_status
  ON remediation_plans(student_id,status,priority DESC);

CREATE TABLE IF NOT EXISTS personalized_lessons (
  id BIGSERIAL PRIMARY KEY,
  remediation_plan_id BIGINT NOT NULL UNIQUE REFERENCES remediation_plans(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  schema_version VARCHAR(50) NOT NULL DEFAULT 'personalized_lesson_v1',
  prompt_version VARCHAR(50) NOT NULL DEFAULT 'personalized_lesson_prompt_v1',
  generation_source VARCHAR(20) NOT NULL CHECK (generation_source IN ('ai','fallback','template')),
  quality_status VARCHAR(30) NOT NULL CHECK (quality_status IN ('APPROVED','REVIEW_REQUIRED','REJECTED')),
  quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('READY','ASSIGNED','STARTED','COMPLETED')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  lesson_content JSONB NOT NULL,
  content_hash VARCHAR(128) NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personalized_lessons_student
  ON personalized_lessons(student_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS personalized_lesson_exercises (
  id BIGSERIAL PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES personalized_lessons(id) ON DELETE CASCADE,
  source_question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  section VARCHAR(30) NOT NULL CHECK (section IN ('guided_practice','independent_practice','error_correction','transfer_practice','final_check')),
  position INTEGER NOT NULL,
  question_format VARCHAR(80) NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option VARCHAR(10) NOT NULL,
  explanation TEXT NOT NULL,
  quality_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' CHECK (quality_status IN ('APPROVED','REJECTED')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id,source_question_id),
  UNIQUE (lesson_id,section,position)
);

CREATE TABLE IF NOT EXISTS personalized_lesson_exercise_attempts (
  id BIGSERIAL PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES personalized_lessons(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES personalized_lesson_exercises(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_option VARCHAR(10) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id,exercise_id,student_id)
);

CREATE TABLE IF NOT EXISTS remediation_history (
  id BIGSERIAL PRIMARY KEY,
  remediation_plan_id BIGINT NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remediation_history_plan
  ON remediation_history(remediation_plan_id,created_at DESC);
