"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "044_add_class_schedule.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("class schedule migration adds the missing fresh-schema column safely", () => {
  assert.match(
    migration,
    /ALTER TABLE classes ADD COLUMN IF NOT EXISTS schedule VARCHAR\(200\)/
  );
});

test("class schedule migration preserves existing rows and optional semantics", () => {
  assert.doesNotMatch(migration, /UPDATE|DELETE|TRUNCATE/i);
  assert.doesNotMatch(migration, /SET NOT NULL|NOT NULL/i);
  assert.doesNotMatch(migration, /SET DEFAULT|DEFAULT/i);
});
