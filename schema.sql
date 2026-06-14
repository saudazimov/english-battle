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
  last_active_date DATE,
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
  created_at TIMESTAMP DEFAULT NOW()
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