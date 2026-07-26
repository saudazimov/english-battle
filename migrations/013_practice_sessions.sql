-- Server-authoritative practice sessions.
CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level VARCHAR(5) NOT NULL,
  question_ids INTEGER[] NOT NULL,
  answered_ids INTEGER[] NOT NULL DEFAULT '{}',
  correct_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_status
  ON practice_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_expires
  ON practice_sessions(expires_at);
