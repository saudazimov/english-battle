"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "039_expand_tournament_cefr_length.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("tournament CEFR migration expands the legacy column to VARCHAR(20)", () => {
  assert.match(
    migration,
    /ALTER TABLE tournaments ALTER COLUMN cefr_level TYPE VARCHAR\(20\)/
  );
});

test("tournament CEFR migration does not alter defaults or nullability", () => {
  assert.doesNotMatch(migration, /SET DEFAULT|DROP DEFAULT/i);
  assert.doesNotMatch(migration, /SET NOT NULL|DROP NOT NULL/i);
});
