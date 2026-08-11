const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cacheIdentity,
  canonicalRuleScope,
  createRemediationContentCacheService,
} = require("../src/services/remediationContentCacheService");

const SCHEMA_VERSION = "personalized_lesson_v3";
const PROMPT_VERSION = "personalized_lesson_prompt_v3";
const CACHE_EXERCISE_PROMPTS = [
  "They ___ working in the library now.","We ___ studying English after school.",
  "The children ___ playing football outside.","My friends ___ reading books together.",
  "Those students ___ writing their answers.","The teachers ___ preparing a new lesson.",
  "Our parents ___ cooking dinner at home.","The workers ___ cleaning the office today.",
  "You ___ listening to the teacher carefully.","The players ___ practising on the field.",
];

function target(questionId = 39) {
  return { taxonomy_id: 17, cefr_level: "A1", evidence: { question_id: questionId } };
}

function exercise(position) {
  return {
    source_question_id: 100 + position, section: "guided_practice", position,
    question_format: "gap_fill", prompt: CACHE_EXERCISE_PROMPTS[position - 1],
    options: { A: "am", B: "is", C: "are", D: "be" }, correct_option: "C",
    explanation: "Use are with a plural subject before verb-ing.",
  };
}

function approvedLessonRow(overrides = {}) {
  return {
    id: 91, generation_source: "ai", quality_warnings: [],
    shared_content: {
      schema_version: "personalized_lesson_v3", target_skill_id: 17,
      lesson_title: "Present Continuous", learning_objective: "Use are before verb-ing.",
      micro_explanation: {
        rule: "Use are before verb-ing.",
        examples: CACHE_EXERCISE_PROMPTS.map((prompt) => ({ sentence: prompt.replace("___","are") })),
      },
      ...overrides,
    },
  };
}

test("cache identity is exact to source question, taxonomy, level and content version", () => {
  const first = cacheIdentity(target(39), SCHEMA_VERSION, PROMPT_VERSION);
  assert.equal(first, `remediation-content:${SCHEMA_VERSION}:${PROMPT_VERSION}:17:question:39:A1`);
  assert.notEqual(first, cacheIdentity(target(40), SCHEMA_VERSION, PROMPT_VERSION));
  assert.equal(cacheIdentity({ taxonomy_id: 17, evidence: {} }, SCHEMA_VERSION, PROMPT_VERSION), null);
});

test("reviewed canonical rule shares cache identity across distinct source questions", () => {
  const signature = {
    rule_signature: "grammar.present_continuous.affirmative.plural_are",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 0.94,
    rule_signature_reviewed: true,
  };
  const first = { ...target(39), ...signature };
  const second = { ...target(874), ...signature };

  assert.deepEqual(canonicalRuleScope(first), {
    type: "rule",
    key: signature.rule_signature,
    version: signature.rule_signature_version,
  });
  assert.equal(
    cacheIdentity(first, SCHEMA_VERSION, PROMPT_VERSION),
    cacheIdentity(second, SCHEMA_VERSION, PROMPT_VERSION)
  );
  assert.equal(canonicalRuleScope({ ...first, rule_signature_confidence: 0.89 }).type, "question");
});

test("quarantined generic rule never shares remediation content", () => {
  const generic = {
    ...target(40),
    rule_signature: "grammar.present_simple.third_person_s_affirmative",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 0.95,
    rule_signature_reviewed: true,
  };
  const otherQuestion = { ...generic, evidence: { question_id: 392 } };

  assert.deepEqual(canonicalRuleScope(generic), {
    type: "question", key: "40", version: null,
  });
  assert.notEqual(
    cacheIdentity(generic, SCHEMA_VERSION, PROMPT_VERSION),
    cacheIdentity(otherQuestion, SCHEMA_VERSION, PROMPT_VERSION)
  );
});

test("cache loads only approved shared content with ten reviewed exercises", async () => {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push([sql, params]);
    if (sql.includes("FROM personalized_lessons l")) return { rows: [approvedLessonRow()] };
    return { rows: Array.from({ length: 10 }, (_, index) => exercise(index + 1)) };
  } };
  const service = createRemediationContentCacheService({
    pool, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, environment: {},
  });

  const cached = await service.load(target());

  assert.equal(cached.exercises.length, 10);
  assert.equal(cached.source, "ai");
  assert.equal("source_error" in cached.sharedContent, false);
  assert.equal("diagnostic_summary" in cached.sharedContent, false);
  assert.match(calls[0][0], /lesson_content - 'source_error'.*-\s*'worked_examples'/s);
  assert.deepEqual(calls[0][1], [17, SCHEMA_VERSION, PROMPT_VERSION, "39", "A1"]);
});

test("cache rejects duplicated lesson examples and exercises", async () => {
  let duplicateExamples = true;
  const pool = { async query(sql) {
    if (sql.includes("FROM personalized_lessons l")) {
      const repeated = Array.from({ length: 10 },() => ({ sentence: "They are working now." }));
      return { rows: [approvedLessonRow(duplicateExamples
        ? { micro_explanation: { rule: "Use are.",examples: repeated } } : {})] };
    }
    const rows = Array.from({ length: 10 },(_,index) => exercise(index + 1));
    return { rows: rows.map((item) => ({ ...item,prompt: rows[0].prompt })) };
  } };
  const service = createRemediationContentCacheService({
    pool,schemaVersion: SCHEMA_VERSION,promptVersion: PROMPT_VERSION,environment: {},
  });

  assert.equal(await service.load(target()),null);
  duplicateExamples = false;
  assert.equal(await service.load(target()),null);
});

test("cache query uses reviewed rule signature instead of source question id", async () => {
  const calls = [];
  const reviewedTarget = {
    ...target(874),
    rule_signature: "grammar.present_continuous.affirmative.plural_are",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 0.94,
    rule_signature_reviewed: true,
  };
  const pool = { async query(sql, params) {
    calls.push([sql, params]);
    if (sql.includes("FROM personalized_lessons l")) return { rows: [approvedLessonRow()] };
    return { rows: Array.from({ length: 10 }, (_, index) => exercise(index + 1)) };
  } };
  const service = createRemediationContentCacheService({
    pool, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, environment: {},
    validateRuleContract: (contract,signature) => contract && contract.signature === signature,
  });

  assert.equal(await service.load(reviewedTarget),null);
  pool.query = async (sql,params) => {
    calls.push([sql,params]);
    if (sql.includes("FROM personalized_lessons l")) {
      return { rows: [approvedLessonRow({ rule_contract: { signature: reviewedTarget.rule_signature } })] };
    }
    return { rows: Array.from({ length: 10 }, (_, index) => exercise(index + 1)) };
  };
  assert.ok(await service.load(reviewedTarget));
  assert.match(calls[0][0], /evidence_snapshot->>'rule_signature'/);
  assert.deepEqual(calls.at(-2)[1], [
    17, SCHEMA_VERSION, PROMPT_VERSION,
    reviewedTarget.rule_signature, reviewedTarget.rule_signature_version, "A1",
  ]);
});

test("reviewed rule cache rejects a contract with another canonical signature", async () => {
  const reviewedTarget = {
    ...target(874),
    rule_signature: "grammar.present_continuous.affirmative.plural_are",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 0.94,
    rule_signature_reviewed: true,
  };
  const pool = { async query(sql) {
    if (sql.includes("FROM personalized_lessons l")) {
      return { rows: [approvedLessonRow({ rule_contract: { signature: "another.rule" } })] };
    }
    throw new Error("Exercises must not load for an invalid contract");
  } };
  const service = createRemediationContentCacheService({
    pool,schemaVersion: SCHEMA_VERSION,promptVersion: PROMPT_VERSION,environment: {},
    validateRuleContract: (contract,signature) => contract && contract.signature === signature,
  });

  assert.equal(await service.load(reviewedTarget),null);
});

test("single-flight waiter reuses the first instance result instead of claiming generation", async () => {
  let lessonLoads = 0;
  let clientReleased = 0;
  const pool = {
    async query(sql) {
      if (sql.includes("FROM personalized_lessons l")) {
        lessonLoads += 1;
        return { rows: lessonLoads === 1 ? [] : [approvedLessonRow()] };
      }
      return { rows: Array.from({ length: 10 }, (_, index) => exercise(index + 1)) };
    },
    async connect() {
      return {
        async query(sql) {
          assert.match(sql, /pg_try_advisory_lock/);
          return { rows: [{ acquired: false }] };
        },
        release() { clientReleased += 1; },
      };
    },
  };
  const service = createRemediationContentCacheService({
    pool, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION,
    environment: { AI_CONTENT_CACHE_WAIT_MS: "5", AI_CONTENT_CACHE_POLL_MS: "5" },
    sleep: async () => {},
  });

  const claim = await service.acquire(target());

  assert.equal(claim.pending, true);
  assert.equal(claim.cached.exercises.length, 10);
  assert.equal(clientReleased, 1);
});

test("parallel lesson requests perform one paid generation and reuse its cached result", async () => {
  let published = false;
  let locked = false;
  let aiCalls = 0;
  let cacheReuses = 0;
  let unlocks = 0;
  let notifyWaiter;
  const waiterObserved = new Promise((resolve) => { notifyWaiter = resolve; });
  const databaseQuery = async (sql) => {
    if (sql.includes("FROM personalized_lessons l")) {
      return { rows: published ? [approvedLessonRow()] : [] };
    }
    return { rows: Array.from({ length: 10 },(_,index) => exercise(index + 1)) };
  };
  const pool = {
    query: databaseQuery,
    async connect() {
      return {
        async query(sql) {
          if (sql.includes("pg_try_advisory_lock")) {
            if (!locked) { locked = true; return { rows: [{ acquired: true }] }; }
            notifyWaiter();
            return { rows: [{ acquired: false }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            locked = false;
            unlocks += 1;
            return { rows: [{ pg_advisory_unlock: true }] };
          }
          return databaseQuery(sql);
        },
        release() {},
      };
    },
  };
  const service = createRemediationContentCacheService({
    pool,schemaVersion: SCHEMA_VERSION,promptVersion: PROMPT_VERSION,
    environment: { AI_CONTENT_CACHE_WAIT_MS: "50",AI_CONTENT_CACHE_POLL_MS: "5" },
    sleep: () => new Promise((resolve) => setImmediate(resolve)),
  });
  async function requestLesson() {
    const claim = await service.acquire(target());
    if (claim.cached) {
      cacheReuses += 1;
      return "cached";
    }
    if (claim.pending) return "pending";
    await waiterObserved;
    aiCalls += 1;
    published = true;
    await service.release(claim.lease);
    return "generated";
  }

  const outcomes = await Promise.all([requestLesson(),requestLesson()]);

  assert.deepEqual(outcomes.sort(),["cached","generated"]);
  assert.equal(aiCalls,1);
  assert.equal(cacheReuses,1);
  assert.equal(unlocks,1);
  assert.equal(locked,false);
});

test("single-flight unlocks its pooled session when cache recheck fails", async () => {
  const calls = [];
  let poolLoads = 0;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("FROM personalized_lessons l")) throw new Error("recheck failed");
      return { rows: [{ pg_advisory_unlock: true }] };
    },
    release(error) { calls.push(error ? "destroy" : "release"); },
  };
  const pool = {
    async query(sql) {
      if (sql.includes("FROM personalized_lessons l") && poolLoads++ === 0) return { rows: [] };
      throw new Error("unexpected pool query");
    },
    async connect() { return client; },
  };
  const service = createRemediationContentCacheService({
    pool, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, environment: {},
  });

  await assert.rejects(service.acquire(target()), /recheck failed/);

  assert.ok(calls.some((sql) => typeof sql === "string" && sql.includes("pg_advisory_unlock")));
  assert.equal(calls.at(-1), "release");
});
