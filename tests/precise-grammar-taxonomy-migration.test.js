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

test("precise grammar taxonomy migration maps approved content fingerprints with audit", () => {
  for (const questionText of [
    "We ___ happy today.",
    "I ___ from Uzbekistan.",
    "They ___ students.",
    "Yesterday we ___ a new topic.",
    "Choose the grammatically correct sentence.",
  ]) {
    assert.match(migration, new RegExp(questionText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(migration, /question\.option_a=desired\.option_a/i);
  assert.match(migration, /question\.correct_option=desired\.correct_option/i);
  assert.doesNotMatch(migration, /desired\(question_id/i);
  assert.match(migration, /INSERT INTO question_analysis_overrides/i);
  assert.match(migration, /'taxonomy_mapping'/i);
  assert.match(migration, /UPDATE question_ai_analysis/i);
  assert.match(migration, /mapped_count <> expected_count/i);
  assert.match(migration, /Expected % precise taxonomy mappings/i);
  assert.match(migration, /^BEGIN;/i);
  assert.match(migration, /COMMIT;$/i);
});
