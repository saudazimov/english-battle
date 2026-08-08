"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "040_require_friendship_status.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("friendship status migration requires existing rows to have a status", () => {
  assert.match(
    migration,
    /ALTER TABLE friendships ALTER COLUMN status SET NOT NULL/
  );
});

test("friendship status migration preserves the column type and default", () => {
  assert.doesNotMatch(migration, /ALTER COLUMN status TYPE/i);
  assert.doesNotMatch(migration, /SET DEFAULT|DROP DEFAULT/i);
});
