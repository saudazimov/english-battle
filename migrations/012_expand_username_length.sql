-- Telegram uslubidagi username uchun maksimal uzunlikni 20 dan 32 ga kengaytirish.
-- Format va 5 belgilik minimum ilova validatsiyasida tekshiriladi.
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(32);
