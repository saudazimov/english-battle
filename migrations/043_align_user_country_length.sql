-- Fresh va legacy users.country turlarini ilovaning ISO-2 contracti bilan
-- xavfsiz moslashtirish.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE country IS NOT NULL
      AND country !~ '^[A-Z]{2}$'
  ) THEN
    RAISE EXCEPTION 'users.country contains non-ISO-2 values';
  END IF;
END
$$;

ALTER TABLE users
  ALTER COLUMN country TYPE VARCHAR(2)
  USING country::VARCHAR(2);
