const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "..",
  "migrations",
  "023_exam_active_session_integrity.sql"
);

test("exam session migration rejects duplicates and enforces one active session per user", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(
    sql,
    /WHERE status = 'active'[\s\S]*GROUP BY user_id[\s\S]*HAVING COUNT\(\*\) > 1/
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_sessions_one_active_per_user\s+ON exam_sessions\(user_id\)\s+WHERE status = 'active'/
  );
  assert.doesNotMatch(sql, /\b(?:DELETE|UPDATE|INSERT)\b/i);
});
