-- Phase 6: versioned student report snapshots, deterministic cache identity,
-- generation de-duplication and auditable report sources.

INSERT INTO system_learning_settings (setting_key, setting_value, description)
VALUES (
  'student_report_quality_gate_v1',
  '{"answer_threshold":30,"assignment_threshold":2,"exam_threshold":1,"reliable_question_threshold":10,"session_threshold":2,"topic_threshold":2,"metadata_confidence_threshold":0.55}',
  'Configurable preliminary/full student diagnostic report thresholds'
)
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE ai_reports
  ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(50) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS generation_job_id BIGINT REFERENCES ai_generation_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_reports_snapshot_cache
  ON ai_reports(target_student_id, report_type, period_start, source_snapshot_hash, created_at DESC)
  WHERE is_stale=false;

CREATE TABLE IF NOT EXISTS ai_report_sources (
  id BIGSERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ai_reports(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  source_id VARCHAR(200) NOT NULL,
  source_snapshot_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_report_sources_report
  ON ai_report_sources(report_id, source_type);
