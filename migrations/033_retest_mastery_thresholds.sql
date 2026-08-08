-- Phase 8: keep mastery state aligned with the deterministic score model.

UPDATE system_learning_settings
SET setting_value = setting_value ||
  '{"mastery_threshold":85,"confidence_threshold":70,"retention_threshold":85}'::jsonb,
    description = 'Deterministic targeted retest, spaced review and mastery thresholds'
WHERE setting_key = 'retest_review_v1';
