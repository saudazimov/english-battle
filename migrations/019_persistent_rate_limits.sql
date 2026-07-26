CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket VARCHAR(80) NOT NULL,
  key_value VARCHAR(240) NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_started TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket, key_value)
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_updated
  ON request_rate_limits(updated_at);
