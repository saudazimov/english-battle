CREATE TABLE IF NOT EXISTS teacher_messages (
  id BIGSERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR(1000) NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_messages_pair
  ON teacher_messages(teacher_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_teacher_messages_unread
  ON teacher_messages(teacher_id, student_id, sender_id) WHERE read_at IS NULL;
