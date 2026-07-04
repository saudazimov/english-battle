-- ============================================================================
-- 900_sprint2a_xss_cleanup.sql — Eski yozuvlardagi XSS-xavfli belgilarni tozalash
-- ============================================================================
-- MUAMMO: server tomonidagi tozalash (stripUnsafe / sanitizeText) joriy
-- etilishidan OLDIN yozilgan yozuvlarda < > " ` \ belgilari qolgan bo'lishi
-- mumkin. Ular sahifada chizilganda stored-XSS xavfini tug'diradi.
--
-- YECHIM: bir martalik tozalash. Qoidalar server kodi bilan BIR XIL:
--   * Ism/maktab kabi maydonlar (stripUnsafe qoidasi):  < > " ` \ olib tashlanadi
--   * Sarlavha/tavsif kabi maydonlar (sanitizeText qoidasi): faqat < > olib tashlanadi
--     (qo'shtirnoq saqlanadi — "Past Simple" kabi sarlavhalar buzilmasin)
--
-- XAVFSIZLIK KAFOLATLARI:
--   * Faqat xavfli belgi BOR yozuvlarga tegiladi (WHERE ~ '[...]') — qolganlar o'zgarmaydi
--   * Idempotent — ikki marta ishlatilsa ham natija bir xil
--   * Jadval mavjud bo'lmasa xato bermaydi (to_regclass tekshiruvi)
--   * questions jadvaliga ATAYIN tegilmaydi: savol matnida < > qonuniy bo'lishi
--     mumkin va frontend uni allaqachon escape qilib chizadi
--
-- ESLATMA: bu faylni ishga tushirishdan OLDIN baza zaxirasini oling:
--   pg_dump -U <user> <db_nomi> > backup_sprint2a.sql
-- ============================================================================

DO $$
DECLARE
  n integer;
BEGIN

  -- ============ 1. USERS — ism, familiya, qishloq, maktab ============
  -- Qoida: stripUnsafe bilan bir xil ( < > " ` \ )
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users SET first_name = regexp_replace(first_name, '[<>"`\\]', '', 'g')
      WHERE first_name ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'users.first_name tozalandi: % ta yozuv', n;

    UPDATE users SET last_name = regexp_replace(last_name, '[<>"`\\]', '', 'g')
      WHERE last_name ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'users.last_name tozalandi: % ta yozuv', n;

    UPDATE users SET village = regexp_replace(village, '[<>"`\\]', '', 'g')
      WHERE village IS NOT NULL AND village ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'users.village tozalandi: % ta yozuv', n;

    UPDATE users SET school = regexp_replace(school, '[<>"`\\]', '', 'g')
      WHERE school IS NOT NULL AND school ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'users.school tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 2. CLASSES — sinf nomi va tavsifi ============
  -- Qoida: sanitizeText bilan bir xil (faqat < >)
  IF to_regclass('public.classes') IS NOT NULL THEN
    UPDATE classes SET name = regexp_replace(name, '[<>]', '', 'g')
      WHERE name ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'classes.name tozalandi: % ta yozuv', n;

    UPDATE classes SET description = regexp_replace(description, '[<>]', '', 'g')
      WHERE description IS NOT NULL AND description ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'classes.description tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 3. ASSIGNMENTS — topshiriq sarlavhasi va tavsifi ============
  IF to_regclass('public.assignments') IS NOT NULL THEN
    UPDATE assignments SET title = regexp_replace(title, '[<>]', '', 'g')
      WHERE title ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'assignments.title tozalandi: % ta yozuv', n;

    UPDATE assignments SET description = regexp_replace(description, '[<>]', '', 'g')
      WHERE description IS NOT NULL AND description ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'assignments.description tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 4. TEACHER_EXAMS — imtihon sarlavhasi va tavsifi ============
  IF to_regclass('public.teacher_exams') IS NOT NULL THEN
    UPDATE teacher_exams SET title = regexp_replace(title, '[<>]', '', 'g')
      WHERE title ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'teacher_exams.title tozalandi: % ta yozuv', n;

    UPDATE teacher_exams SET description = regexp_replace(description, '[<>]', '', 'g')
      WHERE description IS NOT NULL AND description ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'teacher_exams.description tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 5. TEACHER_RESOURCES — resurs sarlavhasi va tavsifi ============
  IF to_regclass('public.teacher_resources') IS NOT NULL THEN
    UPDATE teacher_resources SET title = regexp_replace(title, '[<>]', '', 'g')
      WHERE title ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'teacher_resources.title tozalandi: % ta yozuv', n;

    UPDATE teacher_resources SET description = regexp_replace(description, '[<>]', '', 'g')
      WHERE description IS NOT NULL AND description ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'teacher_resources.description tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 6. TOURNAMENTS — turnir nomi ============
  IF to_regclass('public.tournaments') IS NOT NULL THEN
    UPDATE tournaments SET name = regexp_replace(name, '[<>]', '', 'g')
      WHERE name ~ '[<>]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'tournaments.name tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 7. CHAT_MESSAGES — jang chati (eski xabarlar) ============
  -- Qoida: stripUnsafe bilan bir xil — chat yozuvda shu qoida bilan tozalanadi
  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    UPDATE chat_messages SET sender_name = regexp_replace(sender_name, '[<>"`\\]', '', 'g')
      WHERE sender_name IS NOT NULL AND sender_name ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'chat_messages.sender_name tozalandi: % ta yozuv', n;

    UPDATE chat_messages SET message = regexp_replace(message, '[<>"`\\]', '', 'g')
      WHERE message ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'chat_messages.message tozalandi: % ta yozuv', n;
  END IF;

  -- ============ 8. BATTLE_HISTORY — raqib ismi saqlangan bo'lsa ============
  -- opponent_name ustuni bo'lmasligi ham mumkin — ustun tekshiruvi bilan
  IF to_regclass('public.battle_history') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'battle_history' AND column_name = 'opponent_name'
  ) THEN
    UPDATE battle_history SET opponent_name = regexp_replace(opponent_name, '[<>"`\\]', '', 'g')
      WHERE opponent_name IS NOT NULL AND opponent_name ~ '[<>"`\\]';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'battle_history.opponent_name tozalandi: % ta yozuv', n;
  END IF;

  RAISE NOTICE 'Sprint 2A tozalash yakunlandi.';
END $$;