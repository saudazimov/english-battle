const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "migrations",
    "036_align_school_invite_creator_type.sql"
  ),
  "utf8"
);

test("school invite creator migration preserves integer legacy schemas", () => {
  assert.match(migration, /IF creator_type = 'integer' THEN\s+RETURN;/);
  assert.match(
    migration,
    /IF creator_type NOT IN \('character varying', 'character', 'text'\)/
  );
});

test("school invite creator migration rejects non-numeric history", () => {
  assert.match(migration, /BTRIM\(created_by\) !~ ''\^\[0-9\]\+\$''/);
  assert.match(
    migration,
    /school_invites\.created_by contains non-numeric historical values/
  );
  assert.doesNotMatch(
    migration,
    /UPDATE\s+(?:public\.)?school_invites[\s\S]*created_by\s*=\s*NULL/i
  );
});

test("school invite creator migration converts only after validation", () => {
  const validationIndex = migration.indexOf("IF has_invalid_values THEN");
  const conversionIndex = migration.indexOf(
    "ALTER COLUMN created_by TYPE INTEGER"
  );

  assert.notEqual(validationIndex, -1);
  assert.notEqual(conversionIndex, -1);
  assert.ok(validationIndex < conversionIndex);
  assert.match(migration, /USING BTRIM\(created_by\)::INTEGER/);
});
