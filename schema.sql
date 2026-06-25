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