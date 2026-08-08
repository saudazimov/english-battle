"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "migrations",
    "042_require_school_battle_point_user.sql"
  ),
  "utf8"
).replace(/\s+/g, " ");

test("school battle point user migration rejects legacy NULL owners", () => {
  assert.match(
    migration,
    /FROM school_battle_points WHERE user_id IS NULL/
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'school_battle_points\.user_id contains NULL values'/
  );
});

test("school battle point user migration requires an owner", () => {
  assert.match(
    migration,
    /ALTER TABLE school_battle_points ALTER COLUMN user_id SET NOT NULL/
  );
});

test("school battle point user migration preserves type and relationships", () => {
  assert.doesNotMatch(migration, /ALTER COLUMN user_id TYPE/i);
  assert.doesNotMatch(migration, /SET DEFAULT|DROP DEFAULT/i);
  assert.doesNotMatch(migration, /DROP CONSTRAINT|ADD CONSTRAINT/i);
});
