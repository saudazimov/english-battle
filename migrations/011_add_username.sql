-- 011_add_username.sql — Foydalanuvchi username tizimi (Chess.com/Telegram uslubi)
-- ============================================================================
-- MAQSAD: Har foydalanuvchiga NOYOB username. Reyting, jang, do'stlar, qidiruv —
-- hammasi username orqali ishlaydi (ism takrorlanadi, username yagona).
--
-- QOIDALAR:
--   • Noyob (UNIQUE) — ikki foydalanuvchi bir xil username ololmaydi
--   • Kichik harf saqlanadi (@Jasurbek = @jasurbek — chalkashlik oldini oladi)
--   • Format: a-z, 0-9, _ (validatsiya server logikasida)
--
-- MAVJUD foydalanuvchilar uchun: username NULL bo'ladi (keyin to'ldiriladi yoki
-- profil tahrirlashda so'raladi). Yangi ro'yxatdan o'tishda MAJBURIY.
-- ============================================================================

-- username ustuni (noyob, NULL bo'lishi mumkin — eski userlar uchun)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(20);

-- Noyoblik: ikki bir xil username bo'lmaydi (NULL'lar bundan mustasno)
-- Partial unique index — faqat NULL bo'lmagan username'lar noyob bo'ladi
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON users(username) WHERE username IS NOT NULL;

-- Tez qidirish uchun (username bo'yicha do'st izlash, jang)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);