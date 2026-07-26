-- Class learning features: announcements, attendance and live lessons.

CREATE TABLE IF NOT EXISTS class_announcements (
  id BIGSERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_announcements_class
  ON class_announcements(class_id, is_pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS class_lessons (
  id BIGSERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1000),
  meeting_url VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled')),
  starts_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_lessons_class_status
  ON class_lessons(class_id, status, starts_at DESC);

CREATE TABLE IF NOT EXISTS class_attendance_sessions (
  id BIGSERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id BIGINT REFERENCES class_lessons(id) ON DELETE SET NULL,
  title VARCHAR(160) NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_attendance_sessions_class
  ON class_attendance_sessions(class_id, session_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS class_attendance_records (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES class_attendance_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('present', 'absent', 'late', 'excused')),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_attendance_records_student
  ON class_attendance_records(student_id, status);
