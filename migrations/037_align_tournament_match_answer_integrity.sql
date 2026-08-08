-- Legacy va fresh bazalarda tournament_match_answers yaxlitligini tenglashtirish.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tournament_match_answers
    WHERE answer IS NULL
       OR is_correct IS NULL
       OR created_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'tournament_match_answers contains NULL answer integrity values';
  END IF;
END $$;

ALTER TABLE tournament_match_answers
  ALTER COLUMN answer TYPE VARCHAR(10),
  ALTER COLUMN answer SET NOT NULL,
  ALTER COLUMN is_correct SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

-- Canonical unique indexni saqlab, legacy bazadagi takroriy constraintni olib tashlaymiz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_answer_once
  ON tournament_match_answers(match_id, user_id, question_id);

ALTER TABLE tournament_match_answers
  DROP CONSTRAINT IF EXISTS tournament_match_answers_match_id_user_id_question_id_key;

-- Fresh schema bilan bir xil delete semantikasini tiklaymiz.
ALTER TABLE tournament_match_answers
  DROP CONSTRAINT IF EXISTS tournament_match_answers_match_id_fkey,
  DROP CONSTRAINT IF EXISTS tournament_match_answers_user_id_fkey;

ALTER TABLE tournament_match_answers
  ADD CONSTRAINT tournament_match_answers_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE,
  ADD CONSTRAINT tournament_match_answers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
