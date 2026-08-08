const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classify,
  createQuestionQualityService,
  persistencePayload,
  persistEvaluation,
} = require("../src/services/questionQualityService");

function row(overrides = {}) {
  return {
    id: 1,
    question_text: "She ___ every day.",
    correct_option: "B",
    cefr_level: "A2",
    skill: "grammar",
    status: "published",
    analysis_status: "READY",
    quality_warnings: [],
    attempts: 20,
    correct: 15,
    incorrect: 5,
    timeouts: 0,
    average_response_time_ms: 12000,
    high_mastery_attempts: 0,
    high_mastery_failures: 0,
    metadata_mismatches: 0,
    option_a_count: 5,
    option_b_count: 15,
    option_c_count: 1,
    option_d_count: 1,
    ...overrides,
  };
}

test("question quality keeps low-evidence performance non-accusatory", () => {
  const result = classify(row({ status: null, attempts: 4, correct: 0, incorrect: 4 }), {
    errorRate: 80,
    averageResponseMs: 12000,
  });

  assert.equal(result.evidence_sufficient, false);
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.metrics.observed_question_challenge, 75);
  assert.deepEqual(result.reasons, []);
});

test("question quality detects likely wrong keys from high-mastery failures", () => {
  const result = classify(row({
    attempts: 12,
    correct: 3,
    incorrect: 9,
    high_mastery_attempts: 6,
    high_mastery_failures: 5,
  }), { errorRate: 50, averageResponseMs: 12000 });

  assert.equal(result.status, "POSSIBLE_WRONG_KEY");
  assert.ok(result.reasons.some((reason) => reason.code === "POSSIBLE_WRONG_KEY"));
  assert.equal(result.metrics.error_rate, 75);
});

test("question quality detects ambiguity, metadata and level mismatches deterministically", () => {
  const ambiguous = classify(row({ quality_warnings: ["MULTIPLE_CORRECT_ANSWERS"] }), {
    errorRate: 25,
    averageResponseMs: 12000,
  });
  const metadata = classify(row({ metadata_mismatches: 8 }), {
    errorRate: 25,
    averageResponseMs: 12000,
  });
  const level = classify(row({
    cefr_level: "A1", attempts: 30, correct: 2, incorrect: 28,
    option_a_count: 10, option_b_count: 2, option_c_count: 9, option_d_count: 9,
  }), { errorRate: 93, averageResponseMs: 12000 });

  assert.equal(ambiguous.status, "POSSIBLY_AMBIGUOUS");
  assert.equal(metadata.status, "METADATA_MISMATCH");
  assert.equal(level.status, "LEVEL_MISMATCH");
  assert.ok(level.reasons.some((reason) => reason.code === "LEVEL_MISMATCH"));
});

test("question quality service uses parameterized read query and summarizes flags", async () => {
  const calls = [];
  const service = createQuestionQualityService({
    pool: {
      async query(sql, params) {
        calls.push([sql.replace(/\s+/g, " ").trim(), params]);
        return {
          rows: [
            row(),
            row({ id: 2, status: "draft", attempts: 0, correct: 0, incorrect: 0 }),
            row({ id: 3, quality_warnings: ["AMBIGUOUS_QUESTION"] }),
          ],
        };
      },
    },
  });

  const result = await service.evaluate();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], []);
  assert.match(calls[0][0], /FROM questions q LEFT JOIN question_ai_analysis/);
  assert.match(calls[0][0], /student_skill_profiles/);
  assert.match(calls[0][0], /skill_state_before/);
  assert.equal(result.evaluated_questions, 3);
  assert.equal(result.status_counts.HEALTHY, 1);
  assert.equal(result.status_counts.DISABLED, 1);
  assert.equal(result.status_counts.POSSIBLY_AMBIGUOUS, 1);
  assert.equal(result.flagged_questions[0].question_id, 3);
});

test("question quality persistence payload preserves exact metrics and stable snapshots", () => {
  const question = classify(row({
    timeouts: 3,
    quality_warnings: ["POSSIBLE_WRONG_KEY"],
  }), { errorRate: 35.555, averageResponseMs: 11500.4 });

  const first = persistencePayload([question]);
  const second = persistencePayload([question]);

  assert.equal(first.metrics[0].timeout_count, 3);
  assert.equal(first.metrics[0].cohort_error_rate, 35.6);
  assert.equal(first.metrics[0].cohort_average_response_time_ms, 11500);
  assert.equal(first.metrics[0].source_snapshot_hash, second.metrics[0].source_snapshot_hash);
  assert.equal(first.flags[0].flag_code, "POSSIBLE_WRONG_KEY");
  assert.equal(first.flags[0].severity, "critical");
});

test("question quality persistence commits parameterized metric and flag writes", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      return { rows: sql.includes("RETURNING existing.id") ? [{ id: 9 }] : [] };
    },
    release() { calls.push(["release", []]); },
  };
  const question = classify(row({ quality_warnings: ["AMBIGUOUS_QUESTION"] }), {
    errorRate: 25,
    averageResponseMs: 12000,
  });

  const result = await persistEvaluation({ async connect() { return client; } }, [question]);

  assert.equal(result.metrics, 1);
  assert.equal(result.flags, 1);
  assert.equal(result.resolved, 1);
  assert.equal(calls[0][0], "BEGIN");
  assert.match(calls[1][0], /INSERT INTO question_quality_metrics/);
  assert.equal(calls[1][1].length, 1);
  assert.match(calls[2][0], /INSERT INTO question_quality_flags/);
  assert.match(calls[3][0], /UPDATE question_quality_flags/);
  assert.equal(calls[4][0], "COMMIT");
  assert.equal(calls[5][0], "release");
});

test("question quality persistence rolls back and releases on write failure", async () => {
  const calls = [];
  const failure = new Error("write failed");
  const client = {
    async query(sql) {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("INSERT INTO question_quality_metrics")) throw failure;
      return { rows: [] };
    },
    release() { calls.push("release"); },
  };

  await assert.rejects(
    persistEvaluation({ async connect() { return client; } }, [classify(row(), {
      errorRate: 25,
      averageResponseMs: 12000,
    })]),
    failure
  );

  assert.deepEqual(calls.map((call) => call.split?.(" ")[0] || call), [
    "BEGIN", "WITH", "ROLLBACK", "release",
  ]);
});
