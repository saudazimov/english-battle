"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "038_repair_battle_history_question_counts.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("battle history question count migration fails closed on ambiguous history", () => {
  assert.match(migration, /WHERE bh\.total_questions IS NULL GROUP BY bh\.id/);
  assert.match(migration, /HAVING COUNT\(bs\.room_id\) <> 1/);
  assert.match(
    migration,
    /COUNT\(bs\.room_id\) FILTER \(WHERE cardinality\(bs\.question_ids\) > 0\) <> 1/
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'battle_history contains question counts that cannot be recovered safely'/
  );
});

test("battle history question count migration restores exact session size", () => {
  assert.match(
    migration,
    /UPDATE battle_history bh SET total_questions = cardinality\(bs\.question_ids\) FROM battle_sessions bs/
  );
  assert.match(migration, /bs\.room_id = bh\.room_id/);
  assert.match(migration, /cardinality\(bs\.question_ids\) > 0/);
});

test("battle history question count migration aligns the default", () => {
  assert.match(
    migration,
    /ALTER TABLE battle_history ALTER COLUMN total_questions SET DEFAULT 0/
  );
});
