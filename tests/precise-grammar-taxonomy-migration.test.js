"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "049_expand_precise_grammar_taxonomy.sql"),
  "utf8"
).replace(/\s+/g, " ").trim();

test("precise grammar taxonomy migration seeds the approved hierarchy", () => {
  for (const slug of [
    "forms-of-be",
    "using-am-with-i",
    "using-are-with-we-you-they",
    "affirmative-word-order-with-be",
    "past-simple-affirmative",
    "regular-verbs-add-ed",
  ]) {
    assert.match(migration, new RegExp(`'${slug}'`));
  }

  assert.match(migration, /WHERE NOT EXISTS/i);
  assert.doesNotMatch(migration, /ALTER TABLE|CREATE TABLE|DROP TABLE/i);
});

test("precise grammar taxonomy migration maps only the approved questions with audit", () => {
  for (const questionId of [9, 13, 40, 391, 392]) {
    assert.match(migration, new RegExp(`\\(${questionId},`));
  }

  assert.match(migration, /INSERT INTO question_analysis_overrides/i);
  assert.match(migration, /'taxonomy_mapping'/i);
  assert.match(migration, /UPDATE question_ai_analysis/i);
  assert.match(migration, /Expected 5 precise taxonomy mappings/i);
  assert.match(migration, /^BEGIN;/i);
  assert.match(migration, /COMMIT;$/i);
});
