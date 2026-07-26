-- Parol almashtirish, ban yoki logoutdan keyin eski JWT tokenlarni bekor qilish.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
