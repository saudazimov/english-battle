"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "050_quarantine_legacy_remediation_lessons.sql"),
  "utf8"
).replace(/\s+/g, " ").trim();

test("legacy lesson quarantine is atomic, audited, and non-destructive", () => {
  assert.match(migration, /^BEGIN;/i);
  assert.match(migration, /COMMIT;$/i);
  assert.match(migration, /INSERT INTO remediation_history/i);
  assert.match(migration, /'LESSON_QUARANTINED'/i);
  assert.match(migration, /'LEGACY_CANONICAL_EVIDENCE_MISSING'/i);
  assert.doesNotMatch(migration, /\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
});

test("legacy lesson quarantine preserves completed state and reopens only active plans", () => {
  assert.match(migration, /lesson\.status<>'COMPLETED'/i);
  assert.match(migration, /lesson\.completed_at IS NULL/i);
  assert.match(migration, /SET status='TEACHER_REVIEW_REQUIRED'/i);
  assert.match(migration, /SET quality_status='REVIEW_REQUIRED'/i);
  assert.match(migration, /NULLIF\(BTRIM\(plan\.evidence_snapshot->>'rule_signature'\), ''\) IS NULL/i);
  assert.match(migration, /Expected no approved lessons without canonical evidence/i);
  assert.match(migration, /Expected every active quarantined lesson plan to require review/i);
});
