-- 002_fix_legacy_users.sql — Eski bazalarni kodga moslashtirish
-- ============================================================================
-- MUAMMO: Eski schema.sql users jadvalini "email NOT NULL UNIQUE" bilan, lekin
-- "role" / "country" ustunlarsiz yaratgan. 001 baseline IF NOT EXISTS bo'lgani
-- uchun MAVJUD jadvalga tegmaydi — shuning uchun eski bazada bu ustunlar hali
-- ham yetishmaydi. Bu migration ularni xavfsiz qo'shadi.
--
-- Yangi (toza) bazada bu migration deyarli hech narsa qilmaydi, chunki 001
-- allaqachon hammasini to'g'ri yaratgan (ADD COLUMN IF NOT EXISTS → o'tkazib yuboradi).
-- ============================================================================

-- 1. role ustuni (eng muhim — barcha requireXxx middleware shunga tayanadi)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student';

-- 2. country ustuni (national/global ranking uchun)
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'UZ';

-- 3. phone ustuni (agar eski bazada bo'lmasa) + UNIQUE indeks
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON users(phone) WHERE phone IS NOT NULL;

-- 4. email'ni MAJBURIY bo'lmagan holatga keltirish (endi telefon orqali ro'yxat).
--    Eski bazada email NOT NULL UNIQUE bo'lishi mumkin — telefon foydalanuvchilari
--    uchun email yo'q, shuning uchun NOT NULL cheklovini olib tashlaymiz.
--    DIQQAT: ustun bo'lmasa xato bermaslik uchun DO bloki ichida tekshiramiz.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    -- NOT NULL cheklovini olib tashlash (agar bor bo'lsa)
    BEGIN
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'email DROP NOT NULL o''tkazib yuborildi: %', SQLERRM;
    END;
  END IF;
END $$;

-- 5. battle_history'ga yetishmayotgan ustunlar (eski baza uchun)
ALTER TABLE battle_history ADD COLUMN IF NOT EXISTS opponent_id INTEGER;
ALTER TABLE battle_history ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;
ALTER TABLE battle_history ADD COLUMN IF NOT EXISTS room_id VARCHAR(160);

-- 6. tournaments'ga cefr_level (kod ishlatadi, eski schema'da bo'lmasligi mumkin)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS cefr_level VARCHAR(20) DEFAULT 'mixed';

-- 7. tournament_matches'ga questions_data (Model B — bir xil savollar)
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS questions_data JSONB;

-- 8. Foydali indekslar (mavjud bo'lsa o'tkazib yuboriladi)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);