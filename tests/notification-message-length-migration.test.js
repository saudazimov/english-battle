"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "041_align_notification_message_length.sql"),
  "utf8"
).replace(/\s+/g, " ");

test("notification message migration rejects values over the fresh-schema limit", () => {
  assert.match(migration, /WHERE LENGTH\(message\) > 255/);
  assert.match(migration, /RAISE EXCEPTION/);
});

test("notification message migration aligns the legacy type with VARCHAR(255)", () => {
  assert.match(
    migration,
    /ALTER TABLE notifications ALTER COLUMN message TYPE VARCHAR\(255\) USING message::VARCHAR\(255\)/
  );
});

test("notification message migration preserves nullability and defaults", () => {
  assert.doesNotMatch(migration, /SET NOT NULL|DROP NOT NULL/i);
  assert.doesNotMatch(migration, /SET DEFAULT|DROP DEFAULT/i);
});
