const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createQuestionAnalysisService,
  buildFallbackAnalysis,
  analysisStatus,
} = require("../src/services/questionAnalysisService");
const { validateQuestionAnalysisShape } = require("../aiService");

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
  result.analysis_confidence = 0.9;
  result.taxonomy_confidence = 0.9;
  result.level_confidence = 0.9;
  const ids = new Set(catalog.map((node) => node.id));

  assert.equal(validateQuestionAnalysisShape(result, ids, "B"), true);
  assert.equal(validateQuestionAnalysisShape({ ...result, topic_id: 999 }, ids, "B"), false);
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
