BEGIN;

ALTER TABLE question_ai_analysis
  ADD COLUMN IF NOT EXISTS rule_signature VARCHAR(160),
  ADD COLUMN IF NOT EXISTS rule_signature_version VARCHAR(60),
  ADD COLUMN IF NOT EXISTS rule_signature_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS rule_signature_reviewed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE question_ai_analysis
  DROP CONSTRAINT IF EXISTS question_ai_analysis_rule_signature_confidence_check;

ALTER TABLE question_ai_analysis
  ADD CONSTRAINT question_ai_analysis_rule_signature_confidence_check
  CHECK (
    rule_signature_confidence IS NULL
    OR (rule_signature_confidence >= 0 AND rule_signature_confidence <= 1)
  );

ALTER TABLE question_ai_analysis
  DROP CONSTRAINT IF EXISTS question_ai_analysis_rule_signature_review_check;

ALTER TABLE question_ai_analysis
  ADD CONSTRAINT question_ai_analysis_rule_signature_review_check
  CHECK (
    rule_signature_reviewed = false
    OR (
      rule_signature IS NOT NULL
      AND rule_signature_version IS NOT NULL
      AND rule_signature_confidence >= 0.9
      AND rule_signature ~ '^[a-z][a-z0-9]*([._-][a-z0-9]+)+$'
    )
  );

CREATE INDEX IF NOT EXISTS idx_question_ai_analysis_rule_signature
  ON question_ai_analysis(rule_signature_version, rule_signature, estimated_level)
  WHERE rule_signature_reviewed = true AND diagnostic_eligible = true;

COMMIT;
