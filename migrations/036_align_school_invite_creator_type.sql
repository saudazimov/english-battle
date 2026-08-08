-- Align school invite creator identity with the authenticated numeric user ID
-- written by the application. Historical text values must never be discarded.

BEGIN;

DO $migration$
DECLARE
  creator_type TEXT;
  has_invalid_values BOOLEAN;
BEGIN
  SELECT data_type
  INTO creator_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school_invites'
    AND column_name = 'created_by';

  IF creator_type IS NULL THEN
    RAISE EXCEPTION 'school_invites.created_by column is missing';
  END IF;

  IF creator_type = 'integer' THEN
    RETURN;
  END IF;

  IF creator_type NOT IN ('character varying', 'character', 'text') THEN
    RAISE EXCEPTION
      'school_invites.created_by has unsupported type: %', creator_type;
  END IF;

  EXECUTE '
    SELECT EXISTS (
      SELECT 1
      FROM public.school_invites
      WHERE created_by IS NOT NULL
        AND BTRIM(created_by) !~ ''^[0-9]+$''
    )
  '
  INTO has_invalid_values;

  IF has_invalid_values THEN
    RAISE EXCEPTION
      'school_invites.created_by contains non-numeric historical values';
  END IF;

  EXECUTE '
    ALTER TABLE public.school_invites
    ALTER COLUMN created_by TYPE INTEGER
    USING BTRIM(created_by)::INTEGER
  ';
END
$migration$;

COMMIT;
