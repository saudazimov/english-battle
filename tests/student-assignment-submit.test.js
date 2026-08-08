const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentAssignmentSubmitService,
  createAnswerMap,
  gradeQuestions,
} = require("../src/services/studentAssignmentSubmitService");
const {
  createStudentAssignmentSubmitController,
} = require("../src/controllers/studentAssignmentSubmitController");
const studentAssignmentSubmitRoutes = require("../src/routes/studentAssignmentSubmitRoutes");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("student assignment submit preserves answer normalization and grading", () => {
  const answerMap = createAnswerMap([
    { assignment_question_id: "11", answer: "a" },
    { assignment_question_id: 12, answer: "x" },
    { assignment_question_id: "bad", answer: "B" },
    { assignment_question_id: 11, answer: "D" },
  ]);
  assert.deepEqual(answerMap, { 11: "D", 12: null });

  assert.deepEqual(gradeQuestions([
    { id: 11, correct_answer: "D" },
    { id: 12, correct_answer: "A" },
    { id: 13, correct_answer: "C" },
  ], answerMap), {
    correct: 1,
    wrong: 0,
    unanswered: 2,
    rows: [
      { aqId: 11, sel: "D", correct_answer: "D", isCorrect: true },
      { aqId: 12, sel: null, correct_answer: "A", isCorrect: false },
      { aqId: 13, sel: null, correct_answer: "C", isCorrect: false },
    ],
  });
});

test("student assignment submit preserves SQL, transaction, grading, and review", async () => {
  const poolQueries = [];
  const transactionQueries = [];
  let released = false;
  const resultRow = {
    score: 1,
    total: 3,
    percent: 33,
    correct_count: 1,
    wrong_count: 1,
    unanswered_count: 1,
    is_late: true,
    submitted_at: "2026-07-28T00:00:00.000Z",
  };
  const reviewRow = {
    q_order: 1,
    question_text: "Question?",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    explanation: "Because",
    selected_option: "A",
    correct_answer: "A",
    is_correct: true,
  };
  const poolResponses = [
    { rows: [{ id: 8, due_at: "2000-01-01T00:00:00.000Z", question_count: 3 }] },
    { rows: [] },
    { rows: [
      { id: 11, q_order: 1, correct_answer: "A" },
      { id: 12, q_order: 2, correct_answer: "C" },
      { id: 13, q_order: 3, correct_answer: "D" },
    ] },
    { rows: [reviewRow] },
  ];
  const client = {
    async query(sql, params) {
      transactionQueries.push({ sql, params });
      if (sql.includes("INSERT INTO assignment_submissions")) {
        return { rows: [{ id: 91, status: "in_progress" }] };
      }
      if (sql.includes("UPDATE assignment_submissions")) return { rows: [resultRow] };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const service = createStudentAssignmentSubmitService({
    pool: {
      async query(sql, params) {
        poolQueries.push({ sql, params });
        return poolResponses.shift();
      },
      async connect() {
        return client;
      },
    },
    answerEventService: {
      async recordManySafe() { return []; },
    },
  });

  const outcome = await service.submitAssignment({
    assignmentId: 8,
    studentId: 5,
    answers: [
      { assignment_question_id: 11, answer: "a" },
      { assignment_question_id: 12, answer: "B" },
      { assignment_question_id: 13, answer: "invalid" },
    ],
  });

  assert.deepEqual(outcome, {
    status: "submitted",
    result: resultRow,
    review: [{
      q_order: 1,
      question_text: "Question?",
      options: [
        { key: "A", text: "A" },
        { key: "B", text: "B" },
        { key: "C", text: "C" },
        { key: "D", text: "D" },
      ],
      user_answer: "A",
      correct_answer: "A",
      is_correct: true,
      explanation: "Because",
    }],
  });
  assert.deepEqual(poolQueries[0].params, [8, 5]);
  assert.match(poolQueries[0].sql, /a\.status = 'active'$/);
  assert.deepEqual(poolQueries[1], {
    sql: "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC LIMIT 1",
    params: [8, 5],
  });
  assert.deepEqual(poolQueries[2], {
    sql: `SELECT id, q_order, correct_answer, original_question_id, cefr_level, skill
       FROM assignment_questions WHERE assignment_id=$1 ORDER BY q_order`,
    params: [8],
  });
  assert.deepEqual(transactionQueries.map(({ sql }) => sql.trim().split("\n")[0]), [
    "BEGIN",
    "INSERT INTO assignment_submissions (assignment_id, student_id, total, status)",
    "DELETE FROM submission_answers WHERE submission_id=$1",
    "INSERT INTO submission_answers (submission_id, assignment_question_id, selected_option, correct_answer, is_correct)",
    "INSERT INTO submission_answers (submission_id, assignment_question_id, selected_option, correct_answer, is_correct)",
    "INSERT INTO submission_answers (submission_id, assignment_question_id, selected_option, correct_answer, is_correct)",
    "UPDATE assignment_submissions",
    "COMMIT",
  ]);
  assert.deepEqual(transactionQueries[1].params, [8, 5, 3]);
  assert.deepEqual(transactionQueries[2].params, [91]);
  assert.deepEqual(transactionQueries[3].params, [91, 11, "A", "A", true]);
  assert.deepEqual(transactionQueries[4].params, [91, 12, "B", "C", false]);
  assert.deepEqual(transactionQueries[5].params, [91, 13, null, "D", false]);
  assert.deepEqual(transactionQueries[6].params, [1, 3, 33, 1, 1, 1, true, 91]);
  assert.deepEqual(poolQueries[3].params, [91]);
  assert.equal(released, true);
});

test("student assignment submit preserves missing and submitted guards", async () => {
  const missingService = createStudentAssignmentSubmitService({
    pool: { async query() { return { rows: [] }; } },
  });
  assert.deepEqual(await missingService.submitAssignment({
    assignmentId: 8,
    studentId: 5,
    answers: [],
  }), { status: "assignment-not-found" });

  const responses = [
    { rows: [{ id: 8, due_at: null }] },
    { rows: [{ id: 91, status: "submitted" }] },
  ];
  const submittedService = createStudentAssignmentSubmitService({
    pool: { async query() { return responses.shift(); } },
  });
  assert.deepEqual(await submittedService.submitAssignment({
    assignmentId: 8,
    studentId: 5,
    answers: [],
  }), { status: "already-submitted" });
});

test("student assignment submit preserves existing submission and rollback", async () => {
  const transactionQueries = [];
  let released = false;
  const failure = new Error("answer insert failed");
  const responses = [
    { rows: [{ id: 8, due_at: null }] },
    { rows: [{ id: 91, status: "in_progress" }] },
    { rows: [{ id: 11, correct_answer: "A" }] },
  ];
  const service = createStudentAssignmentSubmitService({
    pool: {
      async query() {
        return responses.shift();
      },
      async connect() {
        return {
          async query(sql) {
            transactionQueries.push(sql);
            if (sql.includes("INSERT INTO submission_answers")) throw failure;
            return { rows: [] };
          },
          release() {
            released = true;
          },
        };
      },
    },
  });

  await assert.rejects(service.submitAssignment({
    assignmentId: 8,
    studentId: 5,
    answers: [{ assignment_question_id: 11, answer: "A" }],
  }), failure);
  assert.deepEqual(transactionQueries.map((sql) => sql.trim().split("\n")[0]), [
    "BEGIN",
    "DELETE FROM submission_answers WHERE submission_id=$1",
    "INSERT INTO submission_answers (submission_id, assignment_question_id, selected_option, correct_answer, is_correct)",
    "ROLLBACK",
  ]);
  assert.equal(released, true);
});

test("student assignment submit controller preserves validation and error logging", async () => {
  const invalidController = createStudentAssignmentSubmitController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.submitAssignment(
    { user: { id: 5 }, params: { id: "bad" }, body: {} },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const missingController = createStudentAssignmentSubmitController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.submitAssignment(
    { user: { id: 5 }, params: { id: "8" }, body: {} },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Topshiriq topilmadi" });

  const failingController = createStudentAssignmentSubmitController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await failingController.submitAssignment(
      { user: { id: 5 }, params: { id: "8" }, body: {} },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Topshiriq topshirish xatosi:", "database unavailable"]]);
});

test("student assignment submit route preserves path and middleware order", () => {
  const router = studentAssignmentSubmitRoutes({ pool: {} });
  const route = router.stack[0].route;

  assert.equal(route.path, "/student/assignments/:id/submit");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
  assert.equal(route.stack.length, 3);
});
