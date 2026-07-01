-- 005_payments.sql — To'lov tizimi (Payme protokoli)
-- ============================================================================
-- payments            — har bir to'lov urinishi (order). Pricing → bu yozuv → Payme
-- payme_transactions  — Payme tranzaksiyalari (protokol holatlari)
--
-- Oqim: foydalanuvchi plan tanlaydi → payments (pending) → Payme to'lov →
--       webhook → payme_transactions → PerformTransaction → obuna beriladi.
-- ============================================================================

-- ===== To'lovlar (order) =====
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan VARCHAR(50) NOT NULL,            -- student_premium | parent_premium | teacher_pro | center_pro
  months INTEGER NOT NULL DEFAULT 1,    -- necha oylik obuna
  amount BIGINT NOT NULL,               -- TIYIN'da (1 so'm = 100 tiyin) — Payme tiyin ishlatadi
  provider VARCHAR(20) NOT NULL DEFAULT 'payme', -- payme | click
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid | cancelled | failed
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);

-- ===== Payme tranzaksiyalari (protokol) =====
-- Payme har order uchun o'z transaction_id (paycom_id) yuboradi.
-- state: 1=yaratildi(pending), 2=to'landi(performed), -1=bekor(pending'дан), -2=bekor(performed'дан)
CREATE TABLE IF NOT EXISTS payme_transactions (
  id SERIAL PRIMARY KEY,
  paycom_transaction_id VARCHAR(50) NOT NULL UNIQUE, -- Payme'ning transaction id
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  paycom_time BIGINT,                   -- Payme yuborgan vaqt (ms)
  amount BIGINT NOT NULL,               -- tiyin
  state INTEGER NOT NULL DEFAULT 1,     -- 1 | 2 | -1 | -2
  reason INTEGER,                       -- bekor qilish sababi (Payme kodlari)
  create_time BIGINT,                   -- tranzaksiya yaratilgan vaqt (ms)
  perform_time BIGINT DEFAULT 0,        -- to'lov amalga oshgan vaqt (ms)
  cancel_time BIGINT DEFAULT 0,         -- bekor qilingan vaqt (ms)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payme_tx_payment ON payme_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payme_tx_paycom ON payme_transactions(paycom_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payme_tx_state ON payme_transactions(state);