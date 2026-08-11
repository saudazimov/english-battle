const test = require("node:test");
const assert = require("node:assert/strict");

const { createQuestionAnalysisService } = require("../src/services/questionAnalysisService");
const {
  estimatedQuestionCost,
  resolveOptions,
} = require("../scripts/backfill-rule-signatures");

function candidatePool() {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      return {
        rows: [
          { id: 11, analysis_version: 1 },
          { id: 15, analysis_version: 2 },
          { id: 19, analysis_version: 1 },
        ],
      };
    },
  };
}

test("backfill dry-run obeys cost cap and does not enqueue jobs", async () => {
  const pool = candidatePool();
  let enqueues = 0;
  const service = createQuestionAnalysisService({
    pool,
    aiService: {},
    durableJobService: {
      async enqueue() { enqueues += 1; },
    },
  });

  const result = await service.backfillRuleSignatures({
    limit: 10,
    dryRun: true,
    estimatedCostPerQuestionUsd: 0.01,
    maxEstimatedCostUsd: 0.02,
  });

  assert.equal(result.selected_count, 2);
  assert.equal(result.queued_count, 0);
  assert.equal(result.estimated_batch_cost_usd, 0.02);
  assert.equal(result.has_more, true);
  assert.equal(result.next_after_id, 15);
  assert.equal(enqueues, 0);
  assert.match(pool.calls[0][0], /diagnostic_eligible=true/);
  assert.match(pool.calls[0][0], /schema_version/);
  assert.deepEqual(pool.calls[0][1], [0, "question_analysis_v2", "question_analysis_prompt_v4", 3]);
});

test("backfill execution uses versioned idempotency and reports duplicates", async () => {
  const pool = candidatePool();
  const jobs = [];
  const service = createQuestionAnalysisService({
    pool,
    aiService: {},
    durableJobService: {
      async enqueue(job) {
        jobs.push(job);
        return Number(job.entityId) === 11 ? { id: 1 } : null;
      },
    },
  });

  const result = await service.backfillRuleSignatures({
    afterId: 10,
    limit: 2,
    dryRun: false,
    estimatedCostPerQuestionUsd: 0.01,
    maxEstimatedCostUsd: 0.02,
  });

  assert.equal(result.queued_count, 1);
  assert.equal(result.duplicate_count, 1);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].idempotencyKey,
    "question-rule-signature-backfill-v6:11:canonical_rule_signature_v1");
  assert.equal(jobs[0].payload.target_schema_version, "question_analysis_v2");
  assert.equal(jobs[0].payload.target_prompt_version, "question_analysis_prompt_v4");
});

test("CLI planner derives a conservative estimate and requires an execute cap", () => {
  const environment = {
    AI_INPUT_COST_PER_MILLION: "0.15",
    AI_OUTPUT_COST_PER_MILLION: "0.60",
  };

  assert.equal(estimatedQuestionCost(environment, []), 0.00378);
  assert.throws(() => resolveOptions(["--execute"], environment), /max-cost-usd/);
  assert.deepEqual(resolveOptions([
    "--execute", "--limit=20", "--after-id=41", "--max-cost-usd=0.05",
  ], environment), {
    afterId: 41,
    limit: 20,
    dryRun: false,
    estimatedCostPerQuestionUsd: 0.00378,
    maxEstimatedCostUsd: 0.05,
  });
});
