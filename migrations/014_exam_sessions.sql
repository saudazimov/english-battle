-- Level imtihoni savollarini aniq urinish bilan bog'laydi.
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_level VARCHAR(5) NOT NULL,
  question_ids INTEGER[] NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_status
  ON exam_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_expires
  ON exam_sessions(expires_at);
