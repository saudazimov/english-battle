const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentAssignmentReviewService,
} = require("../src/services/studentAssignmentReviewService");
const {
  createStudentAssignmentReviewController,
} = require("../src/controllers/studentAssignmentReviewController");
const studentAssignmentReviewRoutes = require("../src/routes/studentAssignmentReviewRoutes");

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

test("student assignment review preserves SQL order and response mapping", async () => {
  const queries = [];
  const assignment = { id: 7, title: "Homework", question_count: 1 };
  const submission = {
    id: 15,
    score: 1,
    total: 1,
    percent: 100,
    correct_count: 1,
    wrong_count: 0,
    unanswered_count: 0,
    is_late: false,
    submitted_at: "2026-07-28T12:00:00.000Z",
  };
  const responses = [
    { rows: [assignment] },
    { rows: [submission] },
    {
      rows: [{
        q_order: 1,
        question_text: "Question?",
        option_a: "A",
        option_b: "B",
        option_c: "C",
        option_d: "D",
        explanation: "Explanation",
        selected_option: "A",
        correct_answer: "A",
        is_correct: true,
      }],
    },
  ];
  const service = createStudentAssignmentReviewService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return responses.shift();
      },
    },
  });

  assert.deepEqual(await service.getReview(7, 20), {
    status: "found",
    result: {
      assignment,
      result: {
        score: 1,
        total: 1,
        percent: 100,
        correct_count: 1,
        wrong_count: 0,
        unanswered_count: 0,
        is_late: false,
        submitted_at: "2026-07-28T12:00:00.000Z",
      },
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
        explanation: "Explanation",
      }],
    },
  });
  assert.deepEqual(queries.map((query) => query.params), [[7, 20], [7, 20], [15]]);
  assert.match(queries[0].sql, /JOIN class_students/);
  assert.match(queries[1].sql, /status='submitted' ORDER BY attempt_number DESC LIMIT 1$/);
  assert.match(queries[2].sql, /WHERE sa\.submission_id = \$1 ORDER BY aq\.q_order$/);
});

test("student assignment review preserves not-found and not-submitted short circuits", async () => {
  let calls = 0;
  const notFound = createStudentAssignmentReviewService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });
  assert.deepEqual(await notFound.getReview(7, 20), { status: "not-found" });
  assert.equal(calls, 1);

  const responses = [{ rows: [{ id: 7 }] }, { rows: [] }];
  const notSubmitted = createStudentAssignmentReviewService({
    pool: { async query() { return responses.shift(); } },
  });
  assert.deepEqual(await notSubmitted.getReview(7, 20), { status: "not-submitted" });
});

test("student assignment review controller preserves validation and errors", async () => {
  const invalidController = createStudentAssignmentReviewController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.getReview({
    params: { id: "invalid" },
    user: { id: 20 },
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const errorController = createStudentAssignmentReviewController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getReview({
      params: { id: "7" },
      user: { id: 20 },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Topshiriq review xatosi:", "database unavailable"]]);
});

test("student assignment review route preserves path and middleware order", () => {
  const router = studentAssignmentReviewRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/assignments/:id/review");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
