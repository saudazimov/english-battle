"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "054_add_rating_progression_audit.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("rating progression migration changes only the new-user rating default", () => {
  assert.match(
    migration,
    /ALTER TABLE users ALTER COLUMN rating SET DEFAULT 500/
  );
  assert.doesNotMatch(migration, /UPDATE users|DELETE FROM users|TRUNCATE users/i);
});

test("rating progression migration adds explicit battle rating audit fields", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_rated BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS rating_before INTEGER/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS rating_after INTEGER/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS opponent_rating_before INTEGER/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS rating_algorithm_version VARCHAR\(40\)/);
});

test("rated rows require complete non-negative audit data", () => {
  assert.match(migration, /ADD CONSTRAINT battle_history_rating_audit_valid CHECK/);
  assert.match(migration, /NOT is_rated OR \( rating_before IS NOT NULL AND rating_before >= 0/);
  assert.match(migration, /rating_after IS NOT NULL AND rating_after >= 0/);
  assert.match(migration, /opponent_rating_before IS NOT NULL AND opponent_rating_before >= 0/);
  assert.match(migration, /NULLIF\(BTRIM\(rating_algorithm_version\), ''\) IS NOT NULL/);
});

test("legacy battle history is not backfilled or recalculated", () => {
  assert.doesNotMatch(migration, /UPDATE battle_history/i);
  assert.doesNotMatch(migration, /DELETE FROM battle_history|TRUNCATE battle_history/i);
});

test("rated history lookup has a focused partial index", () => {
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_bhistory_user_rated_played ON battle_history\(user_id, played_at DESC\) WHERE is_rated = true/
  );
});
