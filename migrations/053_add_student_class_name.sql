ALTER TABLE users
  ADD COLUMN IF NOT EXISTS class_name VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_users_school_class_name
  ON users(school, class_name)
  WHERE role = 'student';
