"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "037_align_tournament_match_answer_integrity.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("tournament answer integrity migration fails closed on NULL history", () => {
  assert.match(
    migration,
    /WHERE answer IS NULL OR is_correct IS NULL OR created_at IS NULL/
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'tournament_match_answers contains NULL answer integrity values'/
  );
});

test("tournament answer integrity migration aligns column definitions", () => {
  assert.match(migration, /ALTER COLUMN answer TYPE VARCHAR\(10\)/);
  assert.match(migration, /ALTER COLUMN answer SET NOT NULL/);
  assert.match(migration, /ALTER COLUMN is_correct SET NOT NULL/);
  assert.match(migration, /ALTER COLUMN created_at SET NOT NULL/);
});

test("tournament answer integrity migration preserves one uniqueness guard", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_answer_once ON tournament_match_answers\(match_id, user_id, question_id\)/
  );
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS tournament_match_answers_match_id_user_id_question_id_key/
  );
});

test("tournament answer integrity migration aligns cascade foreign keys", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(match_id\) REFERENCES tournament_matches\(id\) ON DELETE CASCADE/
  );
  assert.match(
    migration,
    /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/
  );
});
