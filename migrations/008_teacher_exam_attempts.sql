-- ============================================
-- 008_teacher_exam_attempts.sql
-- O'quvchi imtihon urinishlari (Faza 2 — student topshirishi)
-- ============================================

CREATE TABLE IF NOT EXISTS teacher_exam_attempts (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES teacher_exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- in_progress | submitted | expired

  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  expires_at TIMESTAMP,                    -- server-side timer (started_at + duration)

  score INTEGER DEFAULT 0,                 -- to'g'ri javoblar soni
  total INTEGER DEFAULT 0,                 -- jami savollar
  percent INTEGER DEFAULT 0,               -- foiz
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  unanswered_count INTEGER DEFAULT 0,
  passed BOOLEAN DEFAULT false,            -- pass_percent dan o'tdimi

  answers JSONB DEFAULT '{}'::jsonb        -- { "exam_question_id": "a", ... } — recovery + tahlil
);

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_tea_attempts_exam ON teacher_exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_tea_attempts_student ON teacher_exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_tea_attempts_status ON teacher_exam_attempts(status);

-- Bir o'quvchi bir imtihonga bir necha urinish qilishi mumkin (max_attempts gacha),
-- lekin bir vaqtda faqat bitta 'in_progress' bo'lishi kerak — buni backend nazorat qiladi.