-- Legacy team battle tarixidagi yetishmagan savollar sonini tiklash.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM battle_history bh
    LEFT JOIN battle_sessions bs ON bs.room_id = bh.room_id
    WHERE bh.total_questions IS NULL
    GROUP BY bh.id
    HAVING COUNT(bs.room_id) <> 1
       OR COUNT(bs.room_id) FILTER (WHERE cardinality(bs.question_ids) > 0) <> 1
  ) THEN
    RAISE EXCEPTION
      'battle_history contains question counts that cannot be recovered safely';
  END IF;
END $$;

UPDATE battle_history bh
SET total_questions = cardinality(bs.question_ids)
FROM battle_sessions bs
WHERE bh.total_questions IS NULL
  AND bs.room_id = bh.room_id
  AND cardinality(bs.question_ids) > 0;

ALTER TABLE battle_history
  ALTER COLUMN total_questions SET DEFAULT 0;
