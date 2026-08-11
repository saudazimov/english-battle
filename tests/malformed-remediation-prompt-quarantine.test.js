const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("malformed remediation prompt migration quarantines without deleting learning history", () => {
  const sql = fs.readFileSync(
    path.join(__dirname,"../migrations/052_quarantine_malformed_remediation_prompts.sql"),
    "utf8"
  );

  assert.match(sql,/POSITION\('_' IN REPLACE\(q\.question_text,'___',''\)\)>0/);
  assert.match(sql,/MALFORMED_EXERCISE_PROMPT/);
  assert.match(sql,/MALFORMED_QUESTION_PROMPT/);
  assert.match(sql,/lesson\.progress_percent=0/);
  assert.match(sql,/lesson\.completed_at IS NULL/);
  assert.match(sql,/quality_status='REVIEW_REQUIRED'/);
  assert.match(sql,/diagnostic_eligible=false/);
  assert.doesNotMatch(sql,/DELETE FROM personalized_lesson/);
  assert.doesNotMatch(sql,/DELETE FROM remediation_history/);
  assert.doesNotMatch(sql,/DROP TABLE/);
});
