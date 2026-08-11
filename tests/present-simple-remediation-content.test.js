const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname, "..", "migrations", "045_publish_present_simple_remediation_questions.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");
const quarantineSql = fs.readFileSync(path.join(
  __dirname, "..", "migrations", "046_quarantine_misclassified_demo_questions.sql"
), "utf8");

const reviewedQuestions = [
  "My sister ___ English after class.",
  "The bus ___ at seven o''clock.",
  "She ___ her homework in the evening.",
  "Ali ___ football on Fridays.",
  "The baby ___ when it is hungry.",
  "Our teacher ___ every answer.",
  "He ___ TV after dinner.",
  "Madina ___ the dishes at home.",
  "The shop ___ at nine in the morning.",
  "My brother ___ a dictionary to class every day.",
];

test("reviewed Present Simple remediation content publishes ten unique questions", () => {
  for (const question of reviewedQuestions) assert.match(sql, new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(reviewedQuestions.length, 10);
  assert.doesNotMatch(sql, /She ___ to work every weekday\./);
  assert.doesNotMatch(sql, /He ___ to school every day\./);
  assert.match(sql, /status='published'/);
});

test("content migration is idempotent, taxonomy-bound and fails closed below ten questions", () => {
  assert.match(sql, /WHERE NOT EXISTS \(/);
  assert.match(sql, /ON CONFLICT \(question_id\) DO UPDATE/);
  assert.match(sql, /micro\.slug='selecting-s-es-ies'/);
  assert.match(sql, /approved_count < 10/);
  assert.match(sql, /ROLLBACK|COMMIT/);
  assert.doesNotMatch(sql, /ALTER TABLE|CREATE TABLE IF NOT EXISTS/i);
});

test("misclassified legacy questions are removed from diagnostics and active untouched lessons", () => {
  for (const question of [
    "My father _____ a farmer.", "He ___ like coffee.",
    "To ask price: ''___ much is it?''", "she _____ a teacher.",
    "She ___ a doctor in the future.",
  ]) {
    assert.match(quarantineSql, new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(quarantineSql, /He ___ to school every day\./);
  assert.match(quarantineSql, /diagnostic_eligible=false/);
  assert.match(quarantineSql, /DELETE FROM question_taxonomy_tags/);
  assert.match(quarantineSql, /MISCLASSIFIED_EXERCISE_REMOVED/);
  assert.match(quarantineSql, /progress_percent=0/);
  assert.match(quarantineSql, /approved_count < 10/);
});
