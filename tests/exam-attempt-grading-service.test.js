const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createExamAttemptGradingService,
} = require("../src/services/examAttemptGradingService");

function createHarness(results) {
  const queries = [];
  const queue = results.slice();
  const gradeAttempt = createExamAttemptGradingService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
    answerEventService: {
      async recordManySafe() { return []; },
    },
  });
  return { gradeAttempt, queries };
}

test("exam grading preserves missing-attempt result and early return", async () => {
  const harness = createHarness([{ rows: [] }]);

  assert.deepEqual(await harness.gradeAttempt(50), { error: "Urinish topilmadi" });
  assert.equal(harness.queries.length, 1);
  assert.equal(harness.queries[0].sql, "SELECT * FROM teacher_exam_attempts WHERE id = $1");
  assert.deepEqual(harness.queries[0].params, [50]);
});

test("exam grading preserves correct, wrong, unanswered, and pass calculations", async () => {
  const harness = createHarness([
    { rows: [{ id: 50, exam_id: 9, answers: { 1: "a", 2: "C" } }] },
    { rows: [
      { id: 1, correct_answer: "A" },
      { id: 2, correct_answer: "B" },
      { id: 3, correct_answer: "C" },
    ] },
    { rows: [{ pass_percent: 30 }] },
    { rows: [] },
  ]);

  const result = await harness.gradeAttempt(50);

  assert.deepEqual(result, {
    success: true,
    score: 1,
    total: 3,
    percent: 33,
    correct_count: 1,
    wrong_count: 1,
    unanswered_count: 1,
    passed: true,
  });
  assert.deepEqual(harness.queries.map((query) => query.params), [
    [50],
    [9],
    [9],
    [1, 3, 33, 1, 1, true, 50],
  ]);
  assert.match(harness.queries[3].sql, /^UPDATE teacher_exam_attempts SET status = 'submitted'/);
});

test("exam grading preserves zero-question and default pass threshold behavior", async () => {
  const harness = createHarness([
    { rows: [{ id: 51, exam_id: 10, answers: null }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);

  const result = await harness.gradeAttempt(51);

  assert.deepEqual(result, {
    success: true,
    score: 0,
    total: 0,
    percent: 0,
    correct_count: 0,
    wrong_count: 0,
    unanswered_count: 0,
    passed: false,
  });
  assert.deepEqual(harness.queries[3].params, [0, 0, 0, 0, 0, false, 51]);
});

test("exam grading preserves stored null threshold comparison", async () => {
  const harness = createHarness([
    { rows: [{ id: 52, exam_id: 11, answers: {} }] },
    { rows: [] },
    { rows: [{ pass_percent: null }] },
    { rows: [] },
  ]);

  const result = await harness.gradeAttempt(52);

  assert.equal(result.passed, true);
  assert.deepEqual(harness.queries[3].params, [0, 0, 0, 0, 0, true, 52]);
});

test("exam grading preserves database error propagation", async () => {
  const harness = createHarness([new Error("attempt query failed")]);

  await assert.rejects(harness.gradeAttempt(53), { message: "attempt query failed" });
  assert.equal(harness.queries.length, 1);
});
