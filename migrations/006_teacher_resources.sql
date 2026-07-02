-- ============================================
-- 006_teacher_resources.sql
-- O'qituvchi resurslari (materiallar, fayllar)
-- ============================================

CREATE TABLE IF NOT EXISTS teacher_resources (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  file_path VARCHAR(500) NOT NULL,       -- /uploads/resources/... (server ichida)
  file_name VARCHAR(255) NOT NULL,       -- original fayl nomi (yuklab olishda ko'rsatiladi)
  file_type VARCHAR(50),                 -- pdf | doc | ppt | image | other
  file_size INTEGER,                     -- bayt
  cefr_level VARCHAR(5),                 -- A1..C2 (ixtiyoriy)
  skill VARCHAR(50),                     -- grammar/reading/... (ixtiyoriy)
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL, -- ixtiyoriy: sinfga biriktirilgan
  download_count INTEGER DEFAULT 0,      -- necha marta yuklab olindi
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tez qidiruv uchun indekslar
CREATE INDEX IF NOT EXISTS idx_teacher_resources_teacher ON teacher_resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_resources_class ON teacher_resources(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_resources_created ON teacher_resources(created_at DESC);