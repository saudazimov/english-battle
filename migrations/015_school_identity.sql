-- Turnirlarda maktab nomining o'zi yetarli emas: bir xil raqamli maktablar
-- turli tuman/viloyatlarda mavjud. Har bir jamoani region + district + school
-- uchligidan tuzilgan school_key orqali ajratamiz.

ALTER TABLE tournament_schools
  ADD COLUMN IF NOT EXISTS school_key TEXT;

ALTER TABLE tournament_team_members
  ADD COLUMN IF NOT EXISTS school_key TEXT;

ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS school_a_key TEXT,
  ADD COLUMN IF NOT EXISTS school_b_key TEXT,
  ADD COLUMN IF NOT EXISTS winner_school_key TEXT;

ALTER TABLE tournament_match_players
  ADD COLUMN IF NOT EXISTS school_key TEXT;

-- Eski turnir maktablarida hudud bo'sh bo'lsa, jamoa a'zosining profilidan olamiz.
UPDATE tournament_schools ts
SET region = COALESCE(NULLIF(BTRIM(ts.region), ''), src.region),
    district = COALESCE(NULLIF(BTRIM(ts.district), ''), src.district)
FROM (
  SELECT DISTINCT ON (tm.tournament_id, tm.school)
         tm.tournament_id, tm.school, u.region, u.district
  FROM tournament_team_members tm
  JOIN users u ON u.id = tm.user_id
  ORDER BY tm.tournament_id, tm.school, tm.id
) src
WHERE src.tournament_id = ts.tournament_id
  AND src.school = ts.school
  AND (NULLIF(BTRIM(ts.region), '') IS NULL OR NULLIF(BTRIM(ts.district), '') IS NULL);

UPDATE tournament_schools
SET school_key = BTRIM(COALESCE(region, '')) || CHR(31) ||
                 BTRIM(COALESCE(district, '')) || CHR(31) ||
                 BTRIM(school)
WHERE school_key IS NULL OR school_key = '';

UPDATE tournament_team_members tm
SET school_key = ts.school_key
FROM tournament_schools ts
WHERE ts.tournament_id = tm.tournament_id
  AND ts.school = tm.school
  AND (tm.school_key IS NULL OR tm.school_key = '');

-- Agar tarixiy team row uchun tournament_schools topilmasa, user profilidan tiklaymiz.
UPDATE tournament_team_members tm
SET school_key = BTRIM(COALESCE(u.region, '')) || CHR(31) ||
                 BTRIM(COALESCE(u.district, '')) || CHR(31) ||
                 BTRIM(tm.school)
FROM users u
WHERE u.id = tm.user_id
  AND (tm.school_key IS NULL OR tm.school_key = '');

UPDATE tournament_matches m
SET school_a_key = ts.school_key
FROM tournament_schools ts
WHERE ts.tournament_id = m.tournament_id
  AND ts.school = m.school_a
  AND m.school_a IS NOT NULL
  AND (m.school_a_key IS NULL OR m.school_a_key = '');

UPDATE tournament_matches m
SET school_b_key = ts.school_key
FROM tournament_schools ts
WHERE ts.tournament_id = m.tournament_id
  AND ts.school = m.school_b
  AND m.school_b IS NOT NULL
  AND (m.school_b_key IS NULL OR m.school_b_key = '');

UPDATE tournament_matches m
SET winner_school_key = ts.school_key
FROM tournament_schools ts
WHERE ts.tournament_id = m.tournament_id
  AND ts.school = m.winner_school
  AND m.winner_school IS NOT NULL
  AND (m.winner_school_key IS NULL OR m.winner_school_key = '');

UPDATE tournament_match_players mp
SET school_key = ts.school_key
FROM tournament_matches m
JOIN tournament_schools ts ON ts.tournament_id = m.tournament_id
WHERE m.id = mp.match_id
  AND ts.school = mp.school
  AND (mp.school_key IS NULL OR mp.school_key = '');

-- Juda eski matchlarda tournament_schools qatori yo'q bo'lishi mumkin.
UPDATE tournament_match_players mp
SET school_key = CASE
  WHEN mp.school = m.school_a AND m.school_a_key IS NOT NULL THEN m.school_a_key
  WHEN mp.school = m.school_b AND m.school_b_key IS NOT NULL THEN m.school_b_key
  ELSE '' || CHR(31) || '' || CHR(31) || BTRIM(mp.school)
END
FROM tournament_matches m
WHERE m.id = mp.match_id
  AND (mp.school_key IS NULL OR mp.school_key = '');

-- Eski constraint nomi PostgreSQL tomonidan avtomatik yaratilgan.
ALTER TABLE tournament_schools
  DROP CONSTRAINT IF EXISTS tournament_schools_tournament_id_school_key;

ALTER TABLE tournament_schools
  ADD CONSTRAINT uq_tournament_school_identity UNIQUE (tournament_id, school_key);

ALTER TABLE tournament_schools ALTER COLUMN school_key SET NOT NULL;
ALTER TABLE tournament_team_members ALTER COLUMN school_key SET NOT NULL;
ALTER TABLE tournament_match_players ALTER COLUMN school_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tour_team_tid_school_key
  ON tournament_team_members(tournament_id, school_key);
CREATE INDEX IF NOT EXISTS idx_tour_matches_school_a_key
  ON tournament_matches(tournament_id, school_a_key);
CREATE INDEX IF NOT EXISTS idx_tour_matches_school_b_key
  ON tournament_matches(tournament_id, school_b_key);
CREATE INDEX IF NOT EXISTS idx_tour_match_players_mid_school_key
  ON tournament_match_players(match_id, school_key);
