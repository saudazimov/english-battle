-- ============================================
-- 007_teacher_exams.sql
-- O'qituvchi imtihonlari (Ultimate CEFR examdan ALOHIDA)
-- Faza 1: teacher tomoni (yaratish/boshqarish)
-- teacher_exam_attempts Faza 2'da qo'shiladi (student topshirganda)
-- ============================================

-- Imtihon (asosiy)
CREATE TABLE IF NOT EXISTS teacher_exams (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  cefr_level VARCHAR(5),                        -- A1..C2
  skill VARCHAR(50) DEFAULT 'mixed',            -- mixed/grammar/reading/...
  question_count INTEGER NOT NULL DEFAULT 20,
  duration_minutes INTEGER NOT NULL DEFAULT 30, -- imtihon davomiyligi
  pass_percent INTEGER DEFAULT 60,              -- o'tish uchun kerakli %
  max_attempts INTEGER DEFAULT 1,               -- necha marta topshirish mumkin
  starts_at TIMESTAMP,                          -- boshlanish vaqti (NULL = darhol)
  ends_at TIMESTAMP,                            -- tugash vaqti (NULL = cheklanmagan)
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled|active|finished|draft
  created_at TIMESTAMP DEFAULT NOW()
);

-- Imtihon savollari (SNAPSHOT — yaratilganda questions poolidan olinadi)
-- Bu keyin savol o'zgarsa ham imtihon o'zgarmasligini ta'minlaydi
CREATE TABLE IF NOT EXISTS teacher_exam_questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES teacher_exams(id) ON DELETE CASCADE,
  original_question_id INTEGER,                 -- questions.id (referens uchun)
  q_order INTEGER NOT NULL,                     -- savol tartibi
  question_text TEXT NOT NULL,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_answer VARCHAR(5),                    -- 'a'|'b'|'c'|'d' (student javobi bilan solishtiriladi)
  explanation TEXT,
  skill VARCHAR(50),
  cefr_level VARCHAR(5),
  difficulty VARCHAR(30)
);

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_teacher_exams_teacher ON teacher_exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_exams_class ON teacher_exams(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_exams_status ON teacher_exams(status);
CREATE INDEX IF NOT EXISTS idx_teacher_exam_questions_exam ON teacher_exam_questions(exam_id);