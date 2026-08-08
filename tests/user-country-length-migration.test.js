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
    "043_align_user_country_length.sql"
  ),
  "utf8"
).replace(/\s+/g, " ");

test("user country migration rejects non-ISO-2 history", () => {
  assert.match(
    migration,
    /WHERE country IS NOT NULL AND country !~ '\^\[A-Z\]\{2\}\$'/
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'users\.country contains non-ISO-2 values'/
  );
  assert.doesNotMatch(migration, /UPDATE users/i);
});

test("user country migration aligns the column with VARCHAR(2)", () => {
  assert.match(
    migration,
    /ALTER TABLE users ALTER COLUMN country TYPE VARCHAR\(2\) USING country::VARCHAR\(2\)/
  );
});

test("user country migration preserves nullability and default", () => {
  assert.doesNotMatch(migration, /SET NOT NULL|DROP NOT NULL/i);
  assert.doesNotMatch(migration, /SET DEFAULT|DROP DEFAULT/i);
});
