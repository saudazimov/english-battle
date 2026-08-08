-- Unified, append/update-safe diagnostic evidence for every learning mode.
-- Existing source tables remain authoritative for gameplay and grading.

CREATE TABLE IF NOT EXISTS student_answer_events (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
  source_mode VARCHAR(40) NOT NULL,
  source_record_id VARCHAR(200) NOT NULL,
  source_question_id INTEGER NOT NULL,
  selected_option VARCHAR(10),
  correct_option VARCHAR(10),
  is_correct BOOLEAN NOT NULL DEFAULT false,
  timed_out BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INTEGER,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  answer_changed BOOLEAN NOT NULL DEFAULT false,
  change_count INTEGER NOT NULL DEFAULT 0,
  hint_used BOOLEAN NOT NULL DEFAULT false,
  explanation_viewed_before_answer BOOLEAN NOT NULL DEFAULT false,
  detected_cefr_level VARCHAR(10),
  legacy_skill VARCHAR(80),
  main_skill_id INTEGER,
  topic_id INTEGER,
  subskill_id INTEGER,
  micro_skill_id INTEGER,
  selected_distractor_error_code VARCHAR(120),
  question_diagnostic_eligible BOOLEAN NOT NULL DEFAULT false,
  question_analysis_version VARCHAR(50),
  skill_state_before JSONB,
  skill_state_after JSONB,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  answered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  idempotency_key VARCHAR(512) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (attempt_number > 0),
  CHECK (change_count >= 0),
  CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_answer_events_student_time
  ON student_answer_events(student_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_events_student_skill
  ON student_answer_events(student_id, legacy_skill);
CREATE INDEX IF NOT EXISTS idx_answer_events_question
  ON student_answer_events(question_id);
CREATE INDEX IF NOT EXISTS idx_answer_events_source
  ON student_answer_events(source_mode, source_record_id);
CREATE INDEX IF NOT EXISTS idx_answer_events_student_review
  ON student_answer_events(student_id, source_mode, answered_at DESC);

ALTER TABLE ai_reports
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS report_version VARCHAR(30) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS schema_version VARCHAR(50) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS source_snapshot_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_ai_reports_valid_cache
  ON ai_reports(target_student_id, report_type, period_start, is_stale);

-- Preserve historical battle evidence in the unified stream.
INSERT INTO student_answer_events (
  student_id, question_id, source_mode, source_record_id, source_question_id,
  selected_option, correct_option, is_correct, timed_out, attempt_number,
  detected_cefr_level, legacy_skill, answered_at, idempotency_key
)
SELECT
  ba.user_id, ba.question_id, 'battle', ba.room_id, ba.question_id,
  ba.selected_option, ba.correct_option, ba.is_correct, ba.timed_out, 1,
  ba.cefr_level, ba.skill, ba.answered_at,
  'battle:' || ba.user_id || ':' || ba.room_id || ':' || ba.question_id || ':1'
FROM battle_answers ba
WHERE ba.user_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

-- Preserve historical teacher-assignment evidence.
INSERT INTO student_answer_events (
  student_id, question_id, source_mode, source_record_id, source_question_id,
  selected_option, correct_option, is_correct, timed_out, attempt_number,
  detected_cefr_level, legacy_skill, answered_at, idempotency_key
)
SELECT
  s.student_id, aq.original_question_id, 'teacher_assignment', s.id::text, aq.id,
  sa.selected_option, sa.correct_answer, sa.is_correct, false, s.attempt_number,
  aq.cefr_level, aq.skill, COALESCE(sa.answered_at, s.submitted_at, NOW()),
  'teacher_assignment:' || s.student_id || ':' || s.id || ':' || aq.id || ':' || s.attempt_number
FROM submission_answers sa
JOIN assignment_submissions s ON s.id = sa.submission_id
JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
ON CONFLICT (idempotency_key) DO NOTHING;

-- Teacher exams already have answer-level JSON; normalize it without altering it.
INSERT INTO student_answer_events (
  student_id, question_id, source_mode, source_record_id, source_question_id,
  selected_option, correct_option, is_correct, timed_out, attempt_number,
  detected_cefr_level, legacy_skill, answered_at, idempotency_key
)
SELECT
  a.student_id, q.original_question_id, 'class_exam', a.id::text, q.id,
  UPPER(entry.value), UPPER(q.correct_answer),
  LOWER(entry.value) = LOWER(q.correct_answer), false, a.attempt_number,
  q.cefr_level, q.skill, COALESCE(a.submitted_at, a.started_at, NOW()),
  'class_exam:' || a.student_id || ':' || a.id || ':' || q.id || ':' || a.attempt_number
FROM teacher_exam_attempts a
CROSS JOIN LATERAL jsonb_each_text(COALESCE(a.answers, '{}'::jsonb)) entry
JOIN teacher_exam_questions q
  ON q.exam_id = a.exam_id AND q.id::text = entry.key
WHERE NULLIF(entry.value, '') IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;
