"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "051_sync_precise_question_taxonomy_snapshots.sql"),
  "utf8"
).replace(/\s+/g, " ").trim();

test("precise taxonomy snapshot sync is atomic and limited to approved questions", () => {
  assert.match(migration, /^BEGIN;/i);
  assert.match(migration, /COMMIT;$/i);
  assert.match(migration, /ARRAY\[9,13,40,391,392\]::int\[\]/);
  assert.match(migration, /'taxonomy_snapshot_sync'/i);
  assert.match(migration, /INSERT INTO question_analysis_overrides/i);
});

test("precise taxonomy snapshot sync preserves answers and prerequisite tags", () => {
  assert.match(migration, /tag_role IN \('main_skill','topic','subskill','micro_skill'\)/i);
  assert.doesNotMatch(migration, /tag_role='prerequisite'/i);
  assert.match(migration, /UPDATE student_answer_events event SET main_skill_id=/i);
  assert.doesNotMatch(migration, /SET selected_option=|SET correct_option=|SET is_correct=/i);
  assert.match(migration, /Expected 5 synchronized question taxonomy tag sets/i);
  assert.match(migration, /Expected no stale answer-event taxonomy snapshots/i);
});
