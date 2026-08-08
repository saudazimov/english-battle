-- AI privacy lifecycle: deleting a user must not leave personal diagnostic data
-- behind or fail because legacy foreign keys used the default RESTRICT action.

BEGIN;

ALTER TABLE ai_reports
  DROP CONSTRAINT IF EXISTS ai_reports_user_id_fkey,
  ADD CONSTRAINT ai_reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS ai_reports_target_student_id_fkey,
  ADD CONSTRAINT ai_reports_target_student_id_fkey
    FOREIGN KEY (target_student_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_report_feedback
  DROP CONSTRAINT IF EXISTS ai_report_feedback_user_id_fkey,
  ADD CONSTRAINT ai_report_feedback_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_user_id_fkey,
  ADD CONSTRAINT ai_usage_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS ai_usage_logs_report_id_fkey,
  ADD CONSTRAINT ai_usage_logs_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES ai_reports(id) ON DELETE CASCADE;

COMMIT;
