const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "migrations",
  "035_ai_privacy_deletion.sql"
);

test("AI privacy migration applies cascading deletion to every user-owned AI record", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/g);
  assert.match(sql, /FOREIGN KEY \(target_student_id\) REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /FOREIGN KEY \(report_id\) REFERENCES ai_reports\(id\) ON DELETE CASCADE/);
  assert.equal((sql.match(/REFERENCES users\(id\) ON DELETE CASCADE/g) || []).length, 4);
});
