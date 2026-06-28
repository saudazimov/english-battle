-- 003_parent_code_hash.sql — Parent connect-code'ni hash bilan saqlash
-- ============================================================================
-- MUAMMO: parent_connect_code RAW (ochiq matn) saqlanardi. Bolalar platformasi
-- uchun bu xavf — DB leak bo'lsa, har bir bolaga kim ulanishi mumkinligi ko'rinadi.
--
-- YECHIM: Endi kod HASH bo'lib saqlanadi (SHA-256 + server "pepper").
--   • Raw kod faqat yaratilgan paytda BIR MARTA o'quvchiga ko'rsatiladi.
--   • DB'da faqat hash. Hash'dan asl kodni tiklab bo'lmaydi (xuddi parol kabi).
--   • Ota-ona kiritganda: kiritilgan kod hash qilinib, DB hash bilan solishtiriladi.
--
-- Eski raw kodlar endi yaroqsiz — barcha mavjud kodlarni tozalaymiz
-- (o'quvchilar kerak bo'lsa yangi kod yaratadi — TTL'li kod baribir vaqtinchalik).
-- ============================================================================

-- Yangi hash ustuni
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_connect_code_hash VARCHAR(64);

-- Hash bo'yicha tez (va unique) qidirish uchun indeks
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_parent_code_hash
  ON users(parent_connect_code_hash) WHERE parent_connect_code_hash IS NOT NULL;

-- Eski RAW kodlarni tozalaymiz (endi ishlatilmaydi — xavfsizlik uchun o'chiramiz).
-- O'quvchilar parent-code sahifasini ochsa, avtomatik yangi (hash'li) kod yaratiladi.
UPDATE users
SET parent_connect_code = NULL,
    parent_connect_code_created_at = NULL,
    parent_connect_code_expires_at = NULL
WHERE parent_connect_code IS NOT NULL;

-- Eski raw ustunni saqlab qolamiz (DROP qilmaymiz — eski kod hali NULL yozishi mumkin,
-- xato bermasligi uchun). Lekin endi unga HECH NARSA yozilmaydi. Kelajakda alohida
-- migration bilan butunlay o'chirish mumkin.