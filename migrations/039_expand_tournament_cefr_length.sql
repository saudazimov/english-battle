-- Legacy tournaments.cefr_level uzunligini fresh schema bilan moslashtirish.

ALTER TABLE tournaments
  ALTER COLUMN cefr_level TYPE VARCHAR(20);
