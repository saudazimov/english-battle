-- Turnir janglari uchun yetishmayotgan yangi-baza sxemasi va yaxlitlik himoyasi.

CREATE TABLE IF NOT EXISTS tournament_match_answers (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  answer VARCHAR(10) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE tournament_match_players
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP;

-- Eski bazada takroriy javob bo'lsa, birinchi javobni qoldiramiz.
DELETE FROM tournament_match_answers newer
USING tournament_match_answers older
WHERE newer.id > older.id
  AND newer.match_id = older.match_id
  AND newer.user_id = older.user_id
  AND newer.question_id = older.question_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_answer_once
  ON tournament_match_answers(match_id, user_id, question_id);

CREATE INDEX IF NOT EXISTS idx_tournament_match_answers_match_user
  ON tournament_match_answers(match_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_player
  ON tournament_match_players(match_id, user_id)
  WHERE user_id IS NOT NULL;
