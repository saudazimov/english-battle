-- 001_baseline.sql — English Battle bazaviy tuzilma (kodga mos holat)
-- ============================================================================
-- DIQQAT: Bu baseline schema.sql'dagi tuzilmani takrorlaydi, LEKIN users jadvali
-- jonli koddagi haqiqatga moslangan:
--   • email YO'Q (endi telefon orqali ro'yxat — Telegram uslubi)
--   • phone — asosiy identifikator (UNIQUE)
--   • role — student | teacher | parent | school_admin
--   • country — ranking uchun (kelajakda multi-davlat)
-- Barcha CREATE'lar IF NOT EXISTS — mavjud bazani BUZMAYDI. Yangi bazada esa
-- to'g'ridan-to'g'ri kodga mos jadval yaratadi.
-- ============================================================================

-- ===== Foydalanuvchilar =====
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE,                 -- asosiy identifikator (OTP orqali tasdiqlanadi)
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student', -- student | teacher | parent | school_admin
  cefr_level VARCHAR(5) DEFAULT 'A1',
  xp INTEGER DEFAULT 0,
  rating INTEGER DEFAULT 1000,
  coins INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  win_streak INTEGER DEFAULT 0,
  best_win_streak INTEGER DEFAULT 0,
  last_active_date DATE,
  birth_date DATE,
  birth_year INTEGER,
  country VARCHAR(100) DEFAULT 'UZ',        -- ranking qamrovi (national/global)
  region VARCHAR(100),
  district VARCHAR(100),
  village VARCHAR(150),
  school VARCHAR(200),
  profile_picture VARCHAR(255),
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region, district, school);

-- ===== Savollar =====
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

CREATE INDEX IF NOT EXISTS idx_questions_cefr ON questions(cefr_level);
CREATE INDEX IF NOT EXISTS idx_questions_skill ON questions(skill);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);

-- ===== Jang tarixi =====
CREATE TABLE IF NOT EXISTS battle_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opponent_name VARCHAR(100),
  opponent_id INTEGER,
  my_score INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  outcome VARCHAR(10) NOT NULL,
  xp_earned INTEGER DEFAULT 0,
  rating_change INTEGER DEFAULT 0,
  cefr_level VARCHAR(5),
  mode VARCHAR(20) DEFAULT 'ranked',
  total_questions INTEGER DEFAULT 0,
  room_id VARCHAR(160),
  played_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bhistory_user ON battle_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bhistory_room ON battle_history(room_id);

-- ===== Topshiriqlar katalogi (quests) =====
CREATE TABLE IF NOT EXISTS quests (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(255),
  quest_type VARCHAR(50) NOT NULL,
  target INTEGER NOT NULL,
  xp_reward INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

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

-- ===== Do'stlik =====
CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(requester_id, receiver_id)
);

-- ===== Bildirishnomalar =====
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== Audit log =====
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

-- ===== Admin sozlamalari =====
CREATE TABLE IF NOT EXISTS admin_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== Shikoyatlar / flaglar (moderatsiya) =====
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

-- ===== Chat xabarlari =====
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(120),
  sender_id INTEGER REFERENCES users(id),
  sender_name VARCHAR(100),
  message VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== OTP kodlar =====
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);

-- ===== Sinflar (Teacher) =====
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

CREATE INDEX IF NOT EXISTS idx_classes_join_code ON classes(join_code);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);

CREATE TABLE IF NOT EXISTS class_students (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);

-- ===== School Cup turnirlar =====
CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'district',
  scope_value VARCHAR(100),
  region VARCHAR(100),
  parent_tournament_id INTEGER REFERENCES tournaments(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  team_size INTEGER NOT NULL DEFAULT 5,
  reserve_size INTEGER NOT NULL DEFAULT 2,
  bracket_size INTEGER,
  questions_per_match INTEGER NOT NULL DEFAULT 20,
  seconds_per_match INTEGER NOT NULL DEFAULT 300,
  cefr_level VARCHAR(20) DEFAULT 'mixed',
  registration_deadline TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  starts_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_schools (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  school VARCHAR(200) NOT NULL,
  region VARCHAR(100),
  district VARCHAR(100),
  seed INTEGER,
  avg_rating INTEGER DEFAULT 1000,
  placement INTEGER,
  eliminated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tournament_id, school)
);

CREATE TABLE IF NOT EXISTS tournament_team_members (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  school VARCHAR(200) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  member_role VARCHAR(10) NOT NULL DEFAULT 'starter',
  slot_order INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  round INTEGER NOT NULL,
  match_no INTEGER NOT NULL,
  school_a VARCHAR(200),
  school_b VARCHAR(200),
  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  winner_school VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  questions_data JSONB,
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_match_players (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES tournament_matches(id),
  user_id INTEGER REFERENCES users(id),
  school VARCHAR(200) NOT NULL,
  is_bot BOOLEAN DEFAULT false,
  checked_in BOOLEAN DEFAULT false,
  score INTEGER DEFAULT 0,
  finished BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_level_scope ON tournaments(level, scope_value);
CREATE INDEX IF NOT EXISTS idx_tour_schools_tid ON tournament_schools(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tour_team_tid_school ON tournament_team_members(tournament_id, school);
CREATE INDEX IF NOT EXISTS idx_tour_matches_tid ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tour_match_players_mid ON tournament_match_players(match_id);

-- ===== Teacher Assignments (snapshot dizayn) =====
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(150) NOT NULL,
  description TEXT,
  cefr_level VARCHAR(5) NOT NULL,
  skill VARCHAR(50) NOT NULL DEFAULT 'mixed',
  question_count INTEGER NOT NULL,
  due_at TIMESTAMP,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  late_policy VARCHAR(20) NOT NULL DEFAULT 'allow_late',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP
);

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
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  UNIQUE (assignment_id, student_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS submission_answers (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  assignment_question_id INTEGER NOT NULL REFERENCES assignment_questions(id),
  selected_option CHAR(1),
  correct_answer CHAR(1) NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  answered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (submission_id, assignment_question_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_aq_assignment ON assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_asub_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_asub_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_asub_status ON assignment_submissions(status);
CREATE INDEX IF NOT EXISTS idx_sanswers_submission ON submission_answers(submission_id);

-- ===== Parent Dashboard =====
CREATE TABLE IF NOT EXISTS parent_links (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES users(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  relationship VARCHAR(30) DEFAULT 'guardian',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
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

-- ===== Exam history =====
CREATE TABLE IF NOT EXISTS exam_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  exam_type VARCHAR(30) NOT NULL DEFAULT 'ultimate',
  from_level VARCHAR(5) NOT NULL,
  to_level VARCHAR(5),
  total_questions INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  overall_percent INTEGER NOT NULL DEFAULT 0,
  pass_overall_required INTEGER,
  pass_skill_required INTEGER,
  skill_results JSONB,
  passed BOOLEAN NOT NULL DEFAULT false,
  level_changed BOOLEAN NOT NULL DEFAULT false,
  taken_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_taken ON exam_attempts(taken_at);

-- ===== Battle persistence (restart recovery) =====
CREATE TABLE IF NOT EXISTS battle_sessions (
  room_id        VARCHAR(160) PRIMARY KEY,
  mode           VARCHAR(20)  NOT NULL DEFAULT 'ranked',
  battle_type    VARCHAR(20)  NOT NULL DEFAULT '1v1',
  cefr_level     VARCHAR(5),
  length_key     VARCHAR(20),
  question_ids   INTEGER[]    NOT NULL,
  state          JSONB        NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP    DEFAULT NOW(),
  updated_at     TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bsessions_status ON battle_sessions(status);
CREATE INDEX IF NOT EXISTS idx_bsessions_updated ON battle_sessions(updated_at);

CREATE TABLE IF NOT EXISTS battle_answers (
  id              SERIAL PRIMARY KEY,
  room_id         VARCHAR(160) NOT NULL,
  user_id         INTEGER      REFERENCES users(id),
  question_id     INTEGER      NOT NULL REFERENCES questions(id),
  q_order         INTEGER      NOT NULL,
  selected_option CHAR(1),
  correct_option  CHAR(1)      NOT NULL,
  is_correct      BOOLEAN      NOT NULL DEFAULT false,
  timed_out       BOOLEAN      NOT NULL DEFAULT false,
  skill           VARCHAR(50),
  cefr_level      VARCHAR(5),
  answered_at     TIMESTAMP    DEFAULT NOW(),
  UNIQUE (room_id, user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_banswers_user ON battle_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_banswers_room ON battle_answers(room_id);
CREATE INDEX IF NOT EXISTS idx_banswers_skill ON battle_answers(user_id, skill);
CREATE INDEX IF NOT EXISTS idx_banswers_question ON battle_answers(question_id);

-- ===== School Battle points =====
CREATE TABLE IF NOT EXISTS school_battle_points (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  region VARCHAR(100),
  district VARCHAR(100),
  school VARCHAR(200),
  points INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(50),
  season VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sbp_school ON school_battle_points(region, district, school);
CREATE INDEX IF NOT EXISTS idx_sbp_user ON school_battle_points(user_id);
CREATE INDEX IF NOT EXISTS idx_sbp_season ON school_battle_points(season);

-- ===== Parent connect-code ustunlari (baseline'da raw — keyingi migration hash qiladi) =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code VARCHAR(12);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code_created_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_parent_code
  ON users(parent_connect_code) WHERE parent_connect_code IS NOT NULL;