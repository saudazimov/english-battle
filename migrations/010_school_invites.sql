-- 010_school_invites.sql — Maktab admini uchun taklif kodi tizimi
-- ============================================================================
-- MAQSAD: "Maktab admini" roli endi HAR KIMGA ochiq emas. Bu rolда ro'yxatdan
-- o'tish uchun maktabга bog'langan MAXSUS TAKLIF KODI kerak. Kod platforma
-- admini tomonidan yaratiladi va maktab rahbariga beriladi.
--
-- XAVFSIZLIK FALSAFASI (parentCode.js bilan bir xil):
--   • DB'da RAW kod HECH QACHON saqlanmaydi — faqat SHA-256(kod + pepper) hash.
--     Baza sizib chiqsa ham hujumchi kodni tiklay olmaydi (parol kabi).
--   • Kod BIR MARTALIK: ishlatilgach (used_by to'lgach) qayta ishlatilmaydi.
--   • Kod MUDDATLI: expires_at o'tgach kuchsiz bo'ladi (default 30 kun).
--   • 1 MAKTAB = 1 ADMIN: bir maktabда faqat bitta school_admin bo'ladi
--     (nazorat server logikasида: kod yaratishда va ro'yxatdan o'tishда).
--
-- Bu jadval yaratilгач:
--   • server.js — /verify-school-code (kod tekshirish, ochiq)
--   • server.js — /admin/school-invites (kod yaratish, faqat admin)
--   • server.js — /register — school_admin uchun kod majburiy
--
-- Barcha CREATE — IF NOT EXISTS, mavjud bazani buzmaydi (idempotent).
-- ============================================================================

-- ===== MAKTAB TAKLIF KODLARI =====
CREATE TABLE IF NOT EXISTS school_invites (
  id            SERIAL PRIMARY KEY,
  code_hash     VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256(kod + pepper). Raw kod saqlanmaydi.
  school_name   VARCHAR(200) NOT NULL,         -- Kod qaysi maktab uchun (normalizeSchool bilan)
  region        VARCHAR(100),                  -- Maktab viloyati (ro'yxatdан o'tishда avto-to'ldiriladi)
  district      VARCHAR(100),                  -- Maktab tumani
  used_by       INTEGER REFERENCES users(id),  -- Kim ishlatgan (NULL = hali bo'sh)
  used_at       TIMESTAMP,                     -- Qachon ishlatilgan
  created_by    VARCHAR(100),                  -- Qaysi platforma admini yaratgan (admin nomi)
  expires_at    TIMESTAMP,                     -- Muddати (NULL = cheksiz, lekin default 30 kun beriladi)
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Kod tekshiruvi WHERE code_hash = $1 orqali — tez qidirish uchun indeks
CREATE INDEX IF NOT EXISTS idx_school_invites_hash ON school_invites(code_hash);

-- Maktab bo'yicha qidiruv (dublikat kod / mavjud admin tekshiruvи uchun)
CREATE INDEX IF NOT EXISTS idx_school_invites_school ON school_invites(school_name);

-- Bo'sh (ishlatilmagan) kodlarни tez topish uchun qisman indeks
CREATE INDEX IF NOT EXISTS idx_school_invites_unused
  ON school_invites(school_name) WHERE used_by IS NULL;

-- ===== USERS: admin qaysi kod bilan kirganини izlash (audit) =====
-- Ixtiyoriy, lekin foydali: keyinchalik "bu admin qaysi kodдан keldi" degan
-- savolга javob beradi. FK yo'q qilib qo'yamiz (invite o'chsa user qolsin).
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_invite_id INTEGER;