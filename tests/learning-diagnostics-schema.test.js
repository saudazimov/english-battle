const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "migrations",
  "034_learning_diagnostics_persistence.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

test("learning diagnostics migration creates only missing persistence entities", () => {
  const requiredTables = [
    "question_quality_metrics",
    "question_quality_flags",
    "ai_prompt_versions",
    "ai_generation_logs",
    "teacher_overrides",
    "teacher_notes",
  ];

  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  }
  for (const existingTable of [
    "learning_taxonomy",
    "student_answer_events",
    "student_skill_profiles",
    "remediation_plans",
    "personalized_lessons",
    "targeted_retests",
    "review_schedules",
  ]) {
    assert.doesNotMatch(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${existingTable} \\(`));
  }
});

test("question quality persistence uses official statuses and analytics-only challenge", () => {
  for (const status of [
    "HEALTHY",
    "REVIEW_SUGGESTED",
    "POSSIBLY_AMBIGUOUS",
    "POSSIBLE_WRONG_KEY",
    "LEVEL_MISMATCH",
    "METADATA_MISMATCH",
    "DISABLED",
  ]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.match(sql, /observed_question_challenge NUMERIC\(6,2\)/);
  assert.match(sql, /observed_question_challenge BETWEEN 0 AND 100/);
  assert.doesNotMatch(sql, /ALTER TABLE questions[\s\S]*observed_question_challenge/i);
  assert.match(sql, /UNIQUE \(question_id,flag_code\)/);
});

test("AI audit and teacher controls enforce ownership-shaped foreign keys", () => {
  assert.match(sql, /generation_job_id BIGINT REFERENCES ai_generation_jobs\(id\)/);
  assert.match(sql, /prompt_version_id BIGINT REFERENCES ai_prompt_versions\(id\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_prompt_versions_active/);
  assert.match(sql, /teacher_id INTEGER NOT NULL REFERENCES users\(id\)/);
  assert.match(sql, /finding_id BIGINT REFERENCES learning_findings\(id\)/);
  assert.match(sql, /CHECK \(class_id IS NOT NULL OR student_id IS NOT NULL\)/);
  assert.match(sql, /CHECK \(length\(trim\(reason\)\) >= 3\)/);
});

test("production query paths receive required composite indexes", () => {
  const indexes = [
    "idx_question_quality_metrics_status",
    "idx_question_quality_flags_open",
    "idx_ai_generation_logs_job",
    "idx_teacher_overrides_student_skill",
    "idx_teacher_overrides_class_skill",
    "idx_teacher_notes_student",
    "idx_teacher_notes_class_skill",
    "idx_class_students_active_class_student",
    "idx_student_skill_profiles_taxonomy_student",
    "idx_remediation_status_priority",
    "idx_ai_reports_student_period",
    "idx_ai_generation_jobs_status",
  ];

  for (const index of indexes) {
    assert.match(sql, new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${index}`));
  }
});
