-- Legacy school_battle_points.user_id nullability holatini fresh schema bilan
-- xavfsiz moslashtirish.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM school_battle_points
    WHERE user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'school_battle_points.user_id contains NULL values';
  END IF;
END
$$;

ALTER TABLE school_battle_points
  ALTER COLUMN user_id SET NOT NULL;
