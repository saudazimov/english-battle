ALTER TABLE users
  ALTER COLUMN rating SET DEFAULT 500;

ALTER TABLE battle_history
  ADD COLUMN IF NOT EXISTS is_rated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_before INTEGER,
  ADD COLUMN IF NOT EXISTS rating_after INTEGER,
  ADD COLUMN IF NOT EXISTS opponent_rating_before INTEGER,
  ADD COLUMN IF NOT EXISTS rating_algorithm_version VARCHAR(40);

ALTER TABLE battle_history
  DROP CONSTRAINT IF EXISTS battle_history_rating_audit_valid;

ALTER TABLE battle_history
  ADD CONSTRAINT battle_history_rating_audit_valid CHECK (
    NOT is_rated
    OR (
      rating_before IS NOT NULL
      AND rating_before >= 0
      AND rating_after IS NOT NULL
      AND rating_after >= 0
      AND opponent_rating_before IS NOT NULL
      AND opponent_rating_before >= 0
      AND NULLIF(BTRIM(rating_algorithm_version), '') IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_bhistory_user_rated_played
  ON battle_history(user_id, played_at DESC)
  WHERE is_rated = true;
