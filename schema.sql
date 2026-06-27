-- English Battle - ma'lumotlar bazasi tuzilmasi

-- Foydalanuvchilar jadvali
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  cefr_level VARCHAR(5) DEFAULT 'A1',
  xp INTEGER DEFAULT 0,
  rating INTEGER DEFAULT 1000,
  coins INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  win_streak INTEGER DEFAULT 0,
  best_win_streak INTEGER DEFAULT 0,
  last_active_date DATE,
  phone VARCHAR(20),
  birth_date DATE,
  birth_year INTEGER,
  region VARCHAR(100),
  district VARCHAR(100),
  village VARCHAR(150),
  school VARCHAR(200),
  profile_picture VARCHAR(255),
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
-- Savollar jadvali
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option CHAR(1) NOT NULL,
  cefr_level VARCHAR(5) NOT NULL DEFAULT 'A1',
  skill VARCHAR(50) DEFAULT 'grammar',
  difficulty VARCHAR(20) DEFAULT 'easy',
  explanation TEXT,
  status VARCHAR(20) DEFAULT 'published',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Jang tarixi jadvali
CREATE TABLE IF NOT EXISTS battle_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opponent_name VARCHAR(100),
  my_score INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  outcome VARCHAR(10) NOT NULL,
  xp_earned INTEGER DEFAULT 0,
  rating_change INTEGER DEFAULT 0,
  cefr_level VARCHAR(5),
  mode VARCHAR(20) DEFAULT 'ranked',
  played_at TIMESTAMP DEFAULT NOW()
);

-- Topshiriqlar katalogi (qanday topshiriqlar bor)
CREATE TABLE IF NOT EXISTS quests (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(255),
  quest_type VARCHAR(50) NOT NULL,
  target INTEGER NOT NULL,
  xp_reward INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- O'yinchining kunlik topshiriqlari
CREATE TABLE IF NOT EXISTS user_quests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  quest_id INTEGER NOT NULL REFERENCES quests(id),
  progress INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  reward_claimed BOOLEAN DEFAULT false,
  quest_date DATE DEFAULT CURRENT_DATE,
  UNIQUE(user_id, quest_id, quest_date)
);
-- Do'stlik jadvali (so'rovlar va do'stliklar)
CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(requester_id, receiver_id)
);

-- Bildirishnomalar jadvali
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit log (admin amallari tarixi) — kim nima qildi
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER,
  admin_name VARCHAR(150),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(50),
  details TEXT,
  ip_address VARCHAR(60),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin sozlamalari (parol va boshqa tizim sozlamalari)
CREATE TABLE IF NOT EXISTS admin_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Shikoyatlar / flaglar (moderatsiya tizimi)
CREATE TABLE IF NOT EXISTS flags (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER REFERENCES users(id),
  entity_type VARCHAR(20) NOT NULL,
  entity_id INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  comment TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by VARCHAR(150),
  reviewed_at TIMESTAMP,
  context_room_id VARCHAR(120),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat xabarlari (moderatsiya uchun saqlanadi)
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(120),
  sender_id INTEGER REFERENCES users(id),
  sender_name VARCHAR(100),
  message VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- OTP kodlar (telefon tasdiqlash uchun, vaqtincha saqlanadi)
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sinflar (o'qituvchi yaratadigan sinflar — Teacher Panel Phase 2)
-- Har bir sinf bitta o'qituvchiga tegishli. join_code orqali o'quvchilar qo'shiladi.
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  school_id INTEGER,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  join_code VARCHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP
);

-- join_code bo'yicha tez qidirish uchun indeks (o'quvchi kod orqali qo'shilganda)
CREATE INDEX IF NOT EXISTS idx_classes_join_code ON classes(join_code);
-- O'qituvchining sinflarini tez topish uchun indeks
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);

-- Sinf o'quvchilari (qaysi o'quvchi qaysi sinfda — Teacher Panel Phase 2D)
-- O'quvchi join_code orqali sinfga qo'shiladi.
-- UNIQUE(class_id, student_id): bir o'quvchi bir sinfga 2 marta qo'shila olmaydi.
CREATE TABLE IF NOT EXISTS class_students (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (class_id, student_id)
);

-- Sinf o'quvchilarini tez topish uchun indeks
CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);
-- O'quvchi qaysi sinflarda ekanini tez topish uchun indeks
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);

-- ============================================================
-- SCHOOL CUP — TURNIR TIZIMI (Maktablar Kubogi)
-- 3 daraja: Tuman -> Viloyat -> Respublika
-- ============================================================

-- 1. Turnirlar — har bir turnir bitta darajada, bitta hududda
CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'district',   -- district | region | country
  scope_value VARCHAR(100),                        -- qaysi tuman/viloyat nomi (country uchun NULL)
  region VARCHAR(100),                             -- kontekst uchun (tuman turniri qaysi viloyatda)
  parent_tournament_id INTEGER REFERENCES tournaments(id), -- promotion zanjiri (NULL bo'lishi mumkin)
  status VARCHAR(20) NOT NULL DEFAULT 'draft',     -- draft | registration | bracket | live | finished
  team_size INTEGER NOT NULL DEFAULT 5,            -- asosiy a'zo soni
  reserve_size INTEGER NOT NULL DEFAULT 2,         -- zaxira a'zo soni
  bracket_size INTEGER,                            -- 4 | 8 | 16 (setka hajmi, generatsiyada to'ladi)
  questions_per_match INTEGER NOT NULL DEFAULT 20, -- har matchda savol soni
  seconds_per_match INTEGER NOT NULL DEFAULT 300,  -- match vaqti (sek)
  registration_deadline TIMESTAMP,                 -- jamoa tuzish muddati
  created_by INTEGER REFERENCES users(id),
  starts_at TIMESTAMP,                             -- birinchi match vaqti
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Turnirda qatnashuvchi maktablar
CREATE TABLE IF NOT EXISTS tournament_schools (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  school VARCHAR(200) NOT NULL,
  region VARCHAR(100),
  district VARCHAR(100),
  seed INTEGER,                                    -- setkadagi joy (1 = eng kuchli)
  avg_rating INTEGER DEFAULT 1000,                 -- seeding uchun maktab o'rtacha reytingi
  placement INTEGER,                               -- yakuniy o'rin (1 = chempion)
  eliminated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tournament_id, school)
);

-- 3. Maktab jamoasi (qotgan tarkib — school_admin tuzadi)
CREATE TABLE IF NOT EXISTS tournament_team_members (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  school VARCHAR(200) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  member_role VARCHAR(10) NOT NULL DEFAULT 'starter', -- starter | reserve
  slot_order INTEGER,                                  -- 1..N tartib
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

-- 4. Setkadagi matchlar
CREATE TABLE IF NOT EXISTS tournament_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  round INTEGER NOT NULL,                          -- 1 = birinchi raund, oxirgi = final
  match_no INTEGER NOT NULL,                       -- raund ichidagi tartib
  school_a VARCHAR(200),
  school_b VARCHAR(200),
  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  winner_school VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | checkin | live | done
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Matchda kim o'ynaydi va qancha ball to'pladi
CREATE TABLE IF NOT EXISTS tournament_match_players (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES tournament_matches(id),
  user_id INTEGER REFERENCES users(id),            -- bot bo'lsa NULL
  school VARCHAR(200) NOT NULL,
  is_bot BOOLEAN DEFAULT false,
  checked_in BOOLEAN DEFAULT false,
  score INTEGER DEFAULT 0,
  finished BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indekslar (tez qidirish uchun)
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_level_scope ON tournaments(level, scope_value);
CREATE INDEX IF NOT EXISTS idx_tour_schools_tid ON tournament_schools(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tour_team_tid_school ON tournament_team_members(tournament_id, school);
CREATE INDEX IF NOT EXISTS idx_tour_matches_tid ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tour_match_players_mid ON tournament_match_players(match_id);

-- ============================================================
-- TEACHER ASSIGNMENTS (Topshiriqlar tizimi — V1)
-- Savollar yaratishda SNAPSHOT qilinadi: admin bankni o'zgartirsa/o'chirsa ham
-- eski topshiriq natijalari va review buzilmaydi.
-- ============================================================

-- 1. Topshiriqlar
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(150) NOT NULL,
  description TEXT,
  cefr_level VARCHAR(5) NOT NULL,
  skill VARCHAR(50) NOT NULL DEFAULT 'mixed',
  question_count INTEGER NOT NULL,
  due_at TIMESTAMP,                                      -- NULL = muddatsiz
  max_attempts INTEGER NOT NULL DEFAULT 1,
  late_policy VARCHAR(20) NOT NULL DEFAULT 'allow_late', -- allow_late | block_late (keyin)
  status VARCHAR(20) NOT NULL DEFAULT 'active',          -- draft | active | archived
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP
);

-- 2. Topshiriq savollari — SNAPSHOT (matn shu yerda; original_question_id faqat havola)
CREATE TABLE IF NOT EXISTS assignment_questions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  original_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
  q_order INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL,
  explanation TEXT,
  cefr_level VARCHAR(5),
  skill VARCHAR(50),
  difficulty VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (assignment_id, q_order)
);

-- 3. O'quvchi topshirishlari (V1: bitta urinish; attempt_number kelajak uchun)
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  percent INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  unanswered_count INTEGER DEFAULT 0,
  is_late BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',     -- in_progress | submitted | abandoned
  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  UNIQUE (assignment_id, student_id, attempt_number)
);

-- 4. Har savol bo'yicha javob (review + zaif mavzu tahlili uchun)
CREATE TABLE IF NOT EXISTS submission_answers (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  assignment_question_id INTEGER NOT NULL REFERENCES assignment_questions(id),
  selected_option CHAR(1),                               -- NULL = tashlab ketilgan
  correct_answer CHAR(1) NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  answered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (submission_id, assignment_question_id)
);

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_aq_assignment ON assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_asub_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_asub_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_asub_status ON assignment_submissions(status);
CREATE INDEX IF NOT EXISTS idx_sanswers_submission ON submission_answers(submission_id);

-- ============================================================
-- PARENT DASHBOARD (Ota-ona paneli — V1)
-- Ulanish: bola yaratgan qisqa muddatli kod orqali (rozilik).
-- Kod raw saqlanadi (qidirish + qayta ko'rsatish uchun), lekin
-- 7 kun muddat + unique + rate-limit + revocation bilan himoyalanadi.
-- ============================================================

-- O'quvchining ota-ona ulash kodi (talab bo'lganda generatsiya qilinadi)
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code VARCHAR(12);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code_created_at TIMESTAMP;

-- Bitta kod bir vaqtning o'zida faqat bitta o'quvchiniki bo'lsin (NULL'lar cheklanmaydi)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_parent_code
  ON users(parent_connect_code) WHERE parent_connect_code IS NOT NULL;

-- Ota-ona ↔ bola bog'lanishi
CREATE TABLE IF NOT EXISTS parent_links (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES users(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  relationship VARCHAR(30) DEFAULT 'guardian',   -- mother | father | guardian | other
  status VARCHAR(20) NOT NULL DEFAULT 'active',   -- active | revoked
  linked_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  revoked_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_plink_parent ON parent_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_plink_student ON parent_links(student_id);
CREATE INDEX IF NOT EXISTS idx_plink_status ON parent_links(status);

-- ============================================================
-- EXAM HISTORY (Imtihon tarixi — V1)
-- Har Ultimate Exam urinishi to'liq saqlanadi (umumiy + skill bo'yicha).
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  exam_type VARCHAR(30) NOT NULL DEFAULT 'ultimate',  -- ultimate (A1→A2, ...)
  from_level VARCHAR(5) NOT NULL,        -- sinaladigan (joriy) daraja
  to_level VARCHAR(5),                   -- maqsadli (keyingi) daraja; NULL = yo'q
  total_questions INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  overall_percent INTEGER NOT NULL DEFAULT 0,
  pass_overall_required INTEGER,         -- o'sha paytdagi o'tish chegarasi (75)
  pass_skill_required INTEGER,           -- har skill chegarasi (60)
  skill_results JSONB,                   -- { grammar:{correct,total,percent}, ... }
  passed BOOLEAN NOT NULL DEFAULT false,
  level_changed BOOLEAN NOT NULL DEFAULT false,
  taken_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_taken ON exam_attempts(taken_at);