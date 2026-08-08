-- Keep the class schedule contract available on both legacy and fresh databases.

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS schedule VARCHAR(200);
