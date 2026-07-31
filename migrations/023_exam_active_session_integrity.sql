-- Har bir foydalanuvchi uchun faqat bitta faol exam sessiyasiga ruxsat beriladi.
-- Mavjud takroriy sessiyalar avtomatik o'zgartirilmaydi: ular avval tekshirilishi kerak.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM exam_sessions
    WHERE status = 'active'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Cannot enforce one active exam session per user: duplicate active sessions exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_sessions_one_active_per_user
  ON exam_sessions(user_id)
  WHERE status = 'active';
