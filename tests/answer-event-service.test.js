const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAnswerEventService,
  normalizeEvent,
} = require("../src/services/answerEventService");

test("answer event normalization is deterministic and source-scoped", () => {
  const event = normalizeEvent({
    studentId: "42",
    questionId: "8",
    sourceMode: "practice",
    sourceRecordId: "session-1",
    sourceQuestionId: 8,
    selectedOption: "b",
    correctOption: "B",
    isCorrect: true,
    responseTimeMs: "1250",
  });

  assert.equal(event.studentId, 42);
  assert.equal(event.selectedOption, "B");
  assert.equal(event.responseTimeMs, 1250);
  assert.equal(event.idempotencyKey, "practice:42:session-1:8:1");
});

test("answer event batch is transactional and invalidates cached reports once", async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push([normalized, params]);
      if (normalized.startsWith("INSERT INTO student_answer_events")) {
        return { rows: [{ id: calls.length }] };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };
  const service = createAnswerEventService({
    pool: { async connect() { return client; } },
    enrichMetadata: false,
    scheduleProfiles: async () => {},
  });

  const saved = await service.recordMany([
    {
      studentId: 42,
      questionId: 8,
      sourceMode: "battle",
      sourceRecordId: "room-1",
      sourceQuestionId: 8,
      selectedOption: "A",
      correctOption: "B",
      isCorrect: false,
    },
    {
      studentId: 42,
      questionId: 9,
      sourceMode: "battle",
      sourceRecordId: "room-1",
      sourceQuestionId: 9,
      selectedOption: "C",
      correctOption: "C",
      isCorrect: true,
    },
  ]);

  assert.equal(saved.length, 2);
  assert.equal(calls[0][0], "BEGIN");
  assert.match(calls[1][0], /^INSERT INTO student_answer_events/);
  assert.match(calls[2][0], /^INSERT INTO student_answer_events/);
  assert.equal(
    calls.filter(([sql]) => sql.startsWith("UPDATE ai_reports SET is_stale=true")).length,
    1
  );
  assert.equal(calls.at(-1)[0], "COMMIT");
  assert.equal(released, true);
});

test("diagnostic dual-write failure is logged without escaping safe API", async () => {
  const logs = [];
  const service = createAnswerEventService({
    pool: {
      async connect() { throw new Error("diagnostics unavailable"); },
    },
    logger: { error(...args) { logs.push(args); } },
    enrichMetadata: false,
    scheduleProfiles: async () => {},
  });

  const saved = await service.recordManySafe([{
    studentId: 42,
    questionId: 8,
    sourceMode: "practice",
    sourceRecordId: "session-1",
    sourceQuestionId: 8,
    selectedOption: "A",
    correctOption: "B",
    isCorrect: false,
  }]);

  assert.deepEqual(saved, []);
  assert.deepEqual(logs, [[
    "Diagnostic answer-event yozish xato:",
    "diagnostics unavailable",
  ]]);
});

test("approved question analysis enriches future answer events without another AI call", async () => {
  const inserted = [];
  const client = {
    async query(sql, params) {
      if (sql.startsWith("INSERT INTO student_answer_events")) inserted.push(params);
      return { rows: sql.startsWith("INSERT INTO student_answer_events") ? [{ id: 1 }] : [] };
    },
    release() {},
  };
  const service = createAnswerEventService({
    pool: {
      async query(sql) {
        assert.match(sql, /FROM question_ai_analysis/);
        return { rows: [{
          question_id: 8,
          estimated_level: "A2",
          main_skill_id: 10,
          topic_id: 20,
          subskill_id: 30,
          micro_skill_id: 40,
          analysis_version: 2,
          diagnostic_eligible: true,
          option_code: "A",
          error_code: "THIRD_PERSON_S_MISSING",
        }] };
      },
      async connect() { return client; },
    },
    scheduleProfiles: async () => {},
  });

  await service.recordMany([{
    studentId: 42,
    questionId: 8,
    sourceMode: "practice",
    sourceRecordId: "session-2",
    selectedOption: "A",
    correctOption: "B",
    isCorrect: false,
  }]);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][13], "A2");
  assert.deepEqual(inserted[0].slice(15, 19), [10, 20, 30, 40]);
  assert.equal(inserted[0][19], "THIRD_PERSON_S_MISSING");
  assert.equal(inserted[0][20], true);
  assert.equal(inserted[0][21], "2");
});
