"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { enrichMistakeTopics } = require("../aiSnapshot");

function curriculum(errors = 1) {
  return [{
    topic: "Present Continuous",
    rules: [{ taxonomy_id: 42, rule: "plural subject + are + verb-ing", errors, attempts: 4, accuracy: 50 }],
  }];
}

test("progress diagnosis enriches exact rules with longitudinal evidence", () => {
  const result = enrichMistakeTopics(curriculum(), [{
    taxonomy_id: 42,
    evidence_state: "REGRESSED",
    confidence_score: 92,
    mastery_score: 61,
    repeated_misconception_count: 4,
    dominant_error_classification: "auxiliary_selection",
  }], []);
  assert.deepEqual(result[0].rules[0], {
    taxonomy_id: 42,
    rule: "plural subject + are + verb-ing",
    errors: 1,
    attempts: 4,
    accuracy: 50,
    evidence_state: "REGRESSED",
    confidence_score: 92,
    mastery_score: 61,
    repeated_misconception_count: 4,
    error_classification: "auxiliary_selection",
  });
});

test("progress diagnosis remains conservative when only current-period evidence exists", () => {
  assert.equal(enrichMistakeTopics(curriculum(1))[0].rules[0].evidence_state, "OBSERVED");
  assert.equal(enrichMistakeTopics(curriculum(2))[0].rules[0].evidence_state, "LIKELY");
  assert.equal(enrichMistakeTopics(curriculum(3))[0].rules[0].evidence_state, "CONFIRMED");
});
