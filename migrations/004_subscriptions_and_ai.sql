-- 004_subscriptions_and_ai.sql — Premium skeleton + AI reports poydevori
-- ============================================================================
-- Bu migration AI V1 (Parent Weekly Report) uchun zarur jadvallarni yaratadi:
--   • subscriptions    — premium plan (payment hali yo'q, lekin lock test qilinadi)
--   • ai_reports       — yaratilgan AI hisobotlar (cache + tarix)
--   • ai_report_feedback — foydalanuvchi bahosi
--   • ai_usage_logs    — token/narx kuzatuvi (cost control)
--
-- Barcha CREATE — IF NOT EXISTS, mavjud bazani buzmaydi.
-- ============================================================================

-- ===== PREMIUM: obunalar =====
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan VARCHAR(50) NOT NULL,              -- student_premium | parent_premium | teacher_pro | center_pro
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active | expired | cancelled
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
-- Bir foydalanuvchida bir plan turidan faqat bitta aktiv obuna (UPSERT uchun)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_plan_active
  ON subscriptions(user_id, plan) WHERE status = 'active';

-- ===== AI: yaratilgan hisobotlar (cache + tarix) =====
CREATE TABLE IF NOT EXISTS ai_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),           -- hisobotni so'ragan (parent)
  target_student_id INTEGER REFERENCES users(id), -- hisobot kim haqida (child)
  report_type VARCHAR(50) NOT NULL,               -- parent_weekly_report | student_weekly_report | ...
  audience VARCHAR(20) NOT NULL,                  -- parent | student | teacher | admin
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  input_snapshot JSONB NOT NULL,                  -- AI'ga berilgan real data (audit uchun)
  ai_output JSONB NOT NULL,                        -- AI qaytargan JSON hisobot
  confidence VARCHAR(20) DEFAULT 'medium',         -- high | medium | low
  status VARCHAR(20) DEFAULT 'generated',          -- generated | insufficient_data | fallback
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_user ON ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_target ON ai_reports(target_student_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type ON ai_reports(report_type);
-- Cache qidiruvi uchun: kim + kim haqida + tur + davr boshi
CREATE INDEX IF NOT EXISTS idx_ai_reports_cache
  ON ai_reports(target_student_id, report_type, period_start);

-- ===== AI: foydalanuvchi bahosi =====
CREATE TABLE IF NOT EXISTS ai_report_feedback (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES ai_reports(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  rating INTEGER,                          -- 1-5 yoki 1/-1 (foydali/foydasiz)
  feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_report ON ai_report_feedback(report_id);

-- ===== AI: token/narx kuzatuvi (cost control) =====
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  report_id INTEGER REFERENCES ai_reports(id),
  model VARCHAR(50),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_estimate NUMERIC(10, 6),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);