const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createQuestionAnalysisService,
  buildFallbackAnalysis,
  analysisStatus,
  resolveRuleSignatureOverride,
} = require("../src/services/questionAnalysisService");
const {
  validateQuestionAnalysisShape,
  validateRuleSignatureReview,
  applyVerifiedRuleSignature,
} = require("../aiService");

const catalog = [
  { id: 1, node_type: "main_skill", parent_id: null, name: "Grammar", slug: "grammar" },
  { id: 2, node_type: "topic", parent_id: 1, name: "Present Simple", slug: "present-simple" },
  { id: 3, node_type: "subskill", parent_id: 2, name: "Third-person singular", slug: "third-person-singular" },
  { id: 4, node_type: "micro_skill", parent_id: 3, name: "Selecting endings", slug: "selecting-s-es-ies" },
];

const question = {
  id: 42,
  question_text: "My sister ___ TV every evening.",
  option_a: "watch",
  option_b: "watches",
  option_c: "watched",
  option_d: "watching",
  correct_option: "B",
  cefr_level: "A2",
  skill: "grammar",
  explanation: "",
};

test("deterministic question analysis maps stable taxonomy IDs and distractors", () => {
  const result = buildFallbackAnalysis(question, catalog);

  assert.equal(result.estimated_level, "A2");
  assert.equal(result.main_skill_id, 1);
  assert.equal(result.topic_id, 2);
  assert.equal(result.subskill_id, 3);
  assert.equal(result.micro_skill_id, 4);
  assert.deepEqual(result.distractors.map((item) => [item.option, item.error_code]), [
    ["A", "THIRD_PERSON_S_MISSING"],
    ["C", "TENSE_CONFUSION"],
    ["D", "VERB_FORM_CONFUSION"],
  ]);
  assert.equal(analysisStatus(result), "REVIEW_SUGGESTED");
});

test("serious quality warnings force review instead of diagnostic approval", () => {
  const result = buildFallbackAnalysis({ ...question, option_d: "watch" }, catalog);

  assert.ok(result.quality_warnings.includes("MULTIPLE_CORRECT_ANSWERS"));
  assert.equal(analysisStatus(result), "REVIEW_REQUIRED");
});

test("question AI schema accepts catalog IDs and rejects invented taxonomy IDs", () => {
  const result = buildFallbackAnalysis(question, catalog);
  result.schema_version = "question_analysis_v2";
  result.analysis_confidence = 0.9;
  result.taxonomy_confidence = 0.9;
  result.level_confidence = 0.9;
  result.rule_signature_candidate = "grammar.present_simple.third_person_singular";
  result.rule_signature_confidence = 0.95;
  result.rule_signature_evidence = ["The subject is third-person singular and the answer requires -s."];
  const ids = new Set(catalog.map((node) => node.id));

  assert.equal(validateQuestionAnalysisShape(result, ids, "B"), true);
  assert.equal(validateQuestionAnalysisShape({ ...result, topic_id: 999 }, ids, "B"), false);
  assert.equal(validateQuestionAnalysisShape({
    ...result,
    rule_signature_candidate: "stable.lowercase.rule.signature",
  }, ids, "B"), false);
  assert.equal(validateQuestionAnalysisShape({
    ...result,
    rule_signature_candidate: "grammar.present_simple.third_person_s_affirmative",
  }, ids, "B"), false);
});

test("canonical rule signature requires an exact independent high-confidence review", () => {
  const candidate = "grammar.present_continuous.affirmative.plural_are";
  const valid = {
    schema_version: "rule_signature_review_v1",
    rule_signature: candidate,
    approved: true,
    confidence: 0.96,
    exact_rule_match: true,
    correct_answer_supported: true,
    adjacent_rules_excluded: true,
    warnings: [],
  };

  assert.equal(validateRuleSignatureReview(valid, candidate), true);
  assert.equal(validateRuleSignatureReview({ ...valid, confidence: 0.89 }, candidate), false);
  assert.equal(validateRuleSignatureReview({ ...valid, rule_signature: "grammar.present_simple" }, candidate), false);
  assert.equal(validateRuleSignatureReview({ ...valid, warnings: ["MIXED_RULE"] }, candidate), false);
  assert.deepEqual(
    applyVerifiedRuleSignature({
      rule_signature_candidate: candidate,
      rule_signature_confidence: 0.95,
    }, valid),
    {
      rule_signature_candidate: candidate,
      rule_signature_confidence: 0.95,
      rule_signature: candidate,
      rule_signature_version: "canonical_rule_signature_v1",
      rule_signature_reviewed: true,
      rule_signature_review: valid,
    }
  );
  const lowConfidence = applyVerifiedRuleSignature({
    rule_signature_candidate: candidate,
    rule_signature_confidence: 0.89,
  }, valid);
  assert.equal(lowConfidence.rule_signature_reviewed, false);
  assert.equal(lowConfidence.rule_signature_confidence, 0.89);
  assert.equal(applyVerifiedRuleSignature({
    rule_signature_candidate: candidate,
    rule_signature_confidence: 0.95,
  }, null).rule_signature_reviewed, false);
});

test("admin canonical rule review preserves, approves, replaces and clears safely", () => {
  const current = {
    rule_signature: "grammar.present_continuous.affirmative.plural_are",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 0.95,
    rule_signature_reviewed: true,
  };

  assert.deepEqual(resolveRuleSignatureOverride(current, {}), { action: "preserve", ...current });
  assert.deepEqual(resolveRuleSignatureOverride(current, {
    rule_signature_action: "approve",
    rule_signature: "grammar.present_continuous.negative.plural_are_not",
  }), {
    action: "approve",
    rule_signature: "grammar.present_continuous.negative.plural_are_not",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 1,
    rule_signature_reviewed: true,
  });
  assert.deepEqual(resolveRuleSignatureOverride(current, { rule_signature_action: "clear" }), {
    action: "clear",
    rule_signature: null,
    rule_signature_version: null,
    rule_signature_confidence: null,
    rule_signature_reviewed: false,
  });
  assert.throws(() => resolveRuleSignatureOverride(current, {
    rule_signature_action: "approve",
    rule_signature: "grammar.present_simple.third_person_s_affirmative",
  }), /karantinda/);
  assert.throws(() => resolveRuleSignatureOverride(current, {
    rule_signature_action: "unknown",
  }), /amali noto'g'ri/);
});

test("admin canonical rule review writes audit values and canonical fields with parameters", async () => {
  const calls = [];
  const current = {
    question_id: 42,
    status: "REVIEW_REQUIRED",
    estimated_level: "A2",
    diagnostic_eligible: false,
    rule_signature: null,
    rule_signature_version: null,
    rule_signature_confidence: null,
    rule_signature_reviewed: false,
  };
  const client = {
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push(["client", normalized, params]);
      if (normalized.includes("FROM question_ai_analysis WHERE question_id=$1 FOR UPDATE")) {
        return { rows: [current] };
      }
      return { rows: [] };
    },
    release() { calls.push(["release"]); },
  };
  const service = createQuestionAnalysisService({
    pool: {
      async connect() { calls.push(["connect"]); return client; },
      async query(sql, params) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        calls.push(["pool", normalized, params]);
        if (normalized.includes("FROM question_ai_analysis a")) return { rows: [current] };
        return { rows: [] };
      },
    },
    aiService: {},
    logger: { error() {} },
  });

  await service.review(42, {
    status: "READY",
    diagnostic_eligible: true,
    estimated_level: "A2",
    rule_signature_action: "approve",
    rule_signature: "grammar.present_continuous.affirmative.plural_are",
    reason: "Savol qoidasiga aynan mos",
  }, "Admin");

  const audit = calls.find(([source, sql]) => source === "client" && sql.startsWith("INSERT INTO question_analysis_overrides"));
  const analysisUpdate = calls.find(([source, sql]) => source === "client" && sql.startsWith("UPDATE question_ai_analysis SET"));
  assert.ok(audit);
  assert.equal(JSON.parse(audit[2][1]).rule_signature, null);
  assert.deepEqual(JSON.parse(audit[2][2]), {
    status: "READY",
    estimated_level: "A2",
    diagnostic_eligible: true,
    rule_signature_action: "approve",
    rule_signature: "grammar.present_continuous.affirmative.plural_are",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 1,
    rule_signature_reviewed: true,
  });
  assert.ok(analysisUpdate);
  assert.match(analysisUpdate[1], /rule_signature=\$5/);
  assert.deepEqual(analysisUpdate[2], [
    42, "READY", "A2", true,
    "grammar.present_continuous.affirmative.plural_are",
    "canonical_rule_signature_v1", 1, true,
  ]);
  const transactionSql = calls.filter(([source]) => source === "client").map((call) => call[1]);
  assert.equal(transactionSql[0], "BEGIN");
  assert.match(transactionSql[1], /FOR UPDATE$/);
  assert.equal(transactionSql.at(-1), "COMMIT");
  assert.ok(calls.some(([source]) => source === "release"));
});

test("admin canonical rule review rolls back every write when question update fails", async () => {
  const sqlCalls = [];
  let released = false;
  const client = {
    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      sqlCalls.push(normalized);
      if (normalized.includes("FROM question_ai_analysis WHERE question_id=$1 FOR UPDATE")) {
        return {
          rows: [{
            status: "REVIEW_REQUIRED",
            estimated_level: "A2",
            diagnostic_eligible: false,
            rule_signature: null,
            rule_signature_version: null,
            rule_signature_confidence: null,
            rule_signature_reviewed: false,
          }],
        };
      }
      if (normalized.startsWith("UPDATE questions SET")) throw new Error("question update failed");
      return { rows: [] };
    },
    release() { released = true; },
  };
  const service = createQuestionAnalysisService({
    pool: { async connect() { return client; } },
    aiService: {},
    logger: { error() {} },
  });

  await assert.rejects(service.review(42, {
    rule_signature_action: "clear",
    reason: "Noto'g'ri canonical qoida",
  }, "Admin"), /question update failed/);

  assert.equal(sqlCalls[0], "BEGIN");
  assert.ok(sqlCalls.some((sql) => sql.startsWith("INSERT INTO question_analysis_overrides")));
  assert.ok(sqlCalls.some((sql) => sql.startsWith("UPDATE question_ai_analysis SET")));
  assert.equal(sqlCalls.at(-1), "ROLLBACK");
  assert.equal(sqlCalls.includes("COMMIT"), false);
  assert.equal(released, true);
});

test("question analysis enqueue is durable, idempotent, and keeps question save independent", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      if (sql.startsWith("SELECT id, updated_at")) {
        return { rows: [{ id: 42, updated_at: new Date("2026-08-06T10:00:00Z") }] };
      }
      return { rows: [] };
    },
  };
  const service = createQuestionAnalysisService({ pool, aiService: {}, logger: { error() {} } });

  assert.equal(await service.enqueue(42, "question_created"), true);
  assert.equal(calls.length, 4);
  assert.match(calls[2][0], /^INSERT INTO ai_generation_jobs/);
  assert.equal(calls[2][1][2], "question-analysis:42:1786010400000");
  assert.match(calls[3][0], /^UPDATE questions SET analysis_status='ANALYSIS_PENDING'/);
});

test("question analysis worker delegates claimed work to durable execution", async () => {
  const calls = [];
  const claimed = { id: 9, entity_id: "42", retry_count: 0, max_retries: 3 };
  const service = createQuestionAnalysisService({
    pool: {},
    aiService: {},
    logger: { error() {} },
    durableJobService: {
      async claimNext() { calls.push("claim"); return claimed; },
      async execute(job, handler, hooks) {
        calls.push(["execute", job, typeof handler, hooks.metadata]);
      },
    },
  });

  assert.equal(await service.processNext(), true);
  assert.deepEqual(calls, [
    "claim",
    ["execute", claimed, "function", { question_id: 42 }],
  ]);
});

test("rule signature backfill fails closed instead of persisting deterministic fallback", async () => {
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (sql.startsWith("SELECT * FROM questions")) return { rows: [question] };
      if (sql.includes("FROM learning_taxonomy")) return { rows: catalog };
      return { rows: [] };
    },
  };
  const service = createQuestionAnalysisService({
    pool,
    aiService: {
      async generateQuestionAnalysis() {
        const error = new Error("openai status 429");
        error.code = "AI_HTTP_ERROR";
        throw error;
      },
    },
    logger: { error() {} },
  });

  await assert.rejects(
    service.analyzeQuestion(42, { requireAi: true }),
    /openai status 429/
  );
  assert.equal(calls.some((sql) => sql.startsWith("INSERT INTO question_ai_analysis")), false);
});

test("rule signature backfill retries when independent review provider fails", async () => {
  const pool = {
    async query(sql) {
      if (sql.startsWith("SELECT * FROM questions")) return { rows: [question] };
      if (sql.includes("FROM learning_taxonomy")) return { rows: catalog };
      return { rows: [] };
    },
  };
  const service = createQuestionAnalysisService({
    pool,
    aiService: {
      async generateQuestionAnalysis() {
        return {
          analysis: { schema_version: "question_analysis_v2" },
          used_ai: true,
          ruleSignatureReviewFailed: true,
        };
      },
    },
    logger: { error() {} },
  });

  await assert.rejects(
    service.analyzeQuestion(42, { requireAi: true }),
    { code: "RULE_SIGNATURE_AI_REQUIRED" }
  );
});

test("question analysis detail includes resolved prerequisites, distractors and overrides", async () => {
  const calls = [];
  const responses = [
    { rows: [{ question_id: 42, estimated_level: "A2", prerequisites: [{ id: 1, name: "Verb forms", node_type: "subskill" }] }] },
    { rows: [{ option_code: "A", error_code: "RULE_GAP", likely_reason: "Missing ending", confidence: 0.9, source: "ai" }] },
    { rows: [{ field_name: "admin_review", reason: "Verified", override_author: "Admin" }] },
  ];
  const service = createQuestionAnalysisService({
    pool: {
      async query(sql, params) {
        calls.push([sql.replace(/\s+/g, " ").trim(), params]);
        return responses.shift();
      },
    },
    aiService: {},
    logger: { error() {} },
  });

  const result = await service.getAnalysis(42);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call[1]), [[42], [42], [42]]);
  assert.match(calls[0][0], /jsonb_array_elements_text/);
  assert.match(calls[0][0], /AS prerequisites/);
  assert.deepEqual(result.prerequisites, [{ id: 1, name: "Verb forms", node_type: "subskill" }]);
  assert.equal(result.distractors[0].error_code, "RULE_GAP");
  assert.equal(result.overrides[0].reason, "Verified");
});
