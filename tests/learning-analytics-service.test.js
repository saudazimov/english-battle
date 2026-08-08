const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateMastery,
  calculateConfidence,
  calculatePriority,
  determineEvidenceState,
  confidenceLabel,
  scheduleSkillProfileUpdates,
  createLearningAnalyticsService,
} = require("../src/services/learningAnalyticsService");

function evidence(overrides = {}) {
  return {
    exposures: 20,
    correct: 14,
    incorrect: 6,
    distinctQuestions: 12,
    sessions: 6,
    formats: 4,
    weightedAccuracy: 70,
    averageResponseTimeMs: 15000,
    expectedResponseTimeMs: 20000,
    hintUsageRate: 0,
    repeatedMisconceptions: 0,
    retentionScore: 0,
    regressionFlag: false,
    analysisQuality: 0.9,
    consistency: 0.9,
    lastAttempt: new Date("2026-08-06T10:00:00Z"),
    lastIncorrectAttempt: new Date("2026-08-06T10:00:00Z"),
    confidenceScore: 70,
    masteryScore: 70,
    errorRate: 30,
    ...overrides,
  };
}

test("mastery is deterministic and differs from raw accuracy", () => {
  const strong = calculateMastery(evidence());
  const penalized = calculateMastery(evidence({ hintUsageRate: 100, repeatedMisconceptions: 5 }));
  assert.ok(strong > 70);
  assert.ok(penalized < strong);
  assert.ok(strong <= 100 && penalized >= 0);
});

test("two perfect answers remain low-confidence evidence", () => {
  const score = calculateConfidence(evidence({
    exposures: 2, distinctQuestions: 2, sessions: 1, formats: 1,
    weightedAccuracy: 100, analysisQuality: 1, consistency: 1,
  }), undefined, new Date("2026-08-06T12:00:00Z"));
  assert.ok(score < 40);
  assert.equal(confidenceLabel(score), "low");
});

test("evidence progresses from observed to confirmed only with cross-context support", () => {
  assert.equal(determineEvidenceState(evidence({ incorrect: 1 })), "OBSERVED");
  assert.equal(determineEvidenceState(evidence({ incorrect: 2 })), "SUSPECTED");
  assert.equal(determineEvidenceState(evidence({ incorrect: 3, distinctQuestions: 3, sessions: 1, formats: 1, confidenceScore: 30 })), "LIKELY");
  assert.equal(determineEvidenceState(evidence({ incorrect: 3, distinctQuestions: 3, sessions: 2, formats: 1, confidenceScore: 45 })), "CONFIRMED");
});

test("regression overrides ordinary evidence and receives higher priority", () => {
  const regressed = evidence({ regressionFlag: true, errorRate: 70, repeatedMisconceptions: 4, confidenceScore: 80 });
  assert.equal(determineEvidenceState(regressed, { current_evidence_state: "MASTERED" }), "REGRESSED");
  const high = calculatePriority(regressed, "REGRESSED", undefined, new Date("2026-08-06T12:00:00Z"));
  const low = calculatePriority(evidence({ errorRate: 10, confidenceScore: 20 }), "OBSERVED", undefined, new Date("2026-08-06T12:00:00Z"));
  assert.ok(high > low);
});

test("saved diagnostic answer schedules each taxonomy node idempotently", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      if (sql.includes("JOIN student_skill_profiles")) return { rows: [] };
      return { rows: [] };
    },
  };
  const count = await scheduleSkillProfileUpdates(pool, [{
    id: 99,
    student_id: 7,
    question_diagnostic_eligible: true,
    main_skill_id: 1,
    topic_id: 2,
    subskill_id: 3,
    micro_skill_id: 4,
    updated_at: new Date("2026-08-06T10:00:00Z"),
  }]);
  assert.equal(count, 4);
  const jobs = calls.filter(([sql]) => sql.includes("INSERT INTO ai_generation_jobs"));
  assert.equal(jobs.length, 1);
  const payload = JSON.parse(jobs[0][1][0]);
  assert.equal(payload.length, 4);
  assert.equal(payload[0].idempotency_key, "skill-profile:v1:7:1:99:1786010400000");
});

test("skill profile worker delegates claimed work to durable execution", async () => {
  const calls = [];
  const claimed = { id: 11, entity_id: "7:4", retry_count: 0, max_retries: 3 };
  const service = createLearningAnalyticsService({
    pool: {},
    patternDetectionService: {},
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
    ["execute", claimed, "function", { entity_id: "7:4" }],
  ]);
});
