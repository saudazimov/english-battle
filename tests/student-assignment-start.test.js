const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentAssignmentStartService,
} = require("../src/services/studentAssignmentStartService");
const {
  createStudentAssignmentStartController,
} = require("../src/controllers/studentAssignmentStartController");
const studentAssignmentStartRoutes = require("../src/routes/studentAssignmentStartRoutes");

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

test("student assignment start preserves creation SQL and safe question mapping", async () => {
  const queries = [];
  const assignment = { id: 7, title: "Homework", question_count: 2 };
  const submission = { id: 15, status: "in_progress", total: 2 };
  const responses = [
    { rows: [assignment] },
    { rows: [] },
    { rows: [submission] },
    {
      rows: [{
        assignment_question_id: 21,
        q_order: 1,
        question_text: "Question?",
        option_a: "A",
        option_b: "B",
        option_c: "C",
        option_d: "D",
        correct_answer: "A",
      }],
    },
  ];
  const service = createStudentAssignmentStartService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return responses.shift();
      },
    },
  });

  const outcome = await service.startAssignment(7, 20);
  assert.deepEqual(outcome, {
    status: "started",
    result: {
      assignment,
      submission,
      locked: false,
      questions: [{
        assignment_question_id: 21,
        q_order: 1,
        question_text: "Question?",
        options: [
          { key: "A", text: "A" },
          { key: "B", text: "B" },
          { key: "C", text: "C" },
          { key: "D", text: "D" },
        ],
      }],
    },
  });
  assert.deepEqual(queries.map((query) => query.params), [
    [7, 20],
    [7, 20],
    [7, 20, 2],
    [7],
  ]);
  assert.match(queries[0].sql, /a\.status = 'active'$/);
  assert.match(queries[2].sql, /VALUES \(\$1, \$2, \$3, 'in_progress'\) RETURNING \*$/);
  assert.doesNotMatch(JSON.stringify(outcome.result.questions), /correct_answer/);
});

test("student assignment start preserves existing in-progress submission", async () => {
  const queries = [];
  const submission = { id: 15, status: "in_progress" };
  const responses = [
    { rows: [{ id: 7, question_count: 2 }] },
    { rows: [submission] },
    { rows: [] },
  ];
  const service = createStudentAssignmentStartService({
    pool: {
      async query(sql) {
        queries.push(sql);
        return responses.shift();
      },
    },
  });

  const outcome = await service.startAssignment(7, 20);
  assert.equal(outcome.status, "started");
  assert.equal(outcome.result.submission, submission);
  assert.equal(queries.length, 3);
  assert.equal(queries.some((sql) => sql.includes("INSERT INTO assignment_submissions")), false);
});

test("student assignment start preserves submitted lock and review mapping", async () => {
  const assignment = { id: 7, question_count: 1 };
  const submission = { id: 15, status: "submitted" };
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
        selected_option: "B",
        correct_answer: "A",
        is_correct: false,
        explanation: "Explanation",
      }],
    },
  ];
  const service = createStudentAssignmentStartService({
    pool: { async query() { return responses.shift(); } },
  });

  const outcome = await service.startAssignment(7, 20);
  assert.equal(outcome.status, "locked");
  assert.equal(outcome.result.locked, true);
  assert.equal(outcome.result.review[0].user_answer, "B");
  assert.equal(outcome.result.review[0].correct_answer, "A");
  assert.deepEqual(outcome.result.review[0].options[0], { key: "A", text: "A" });
});

test("student assignment start preserves not-found and controller error behavior", async () => {
  const notFound = createStudentAssignmentStartService({
    pool: { async query() { return { rows: [] }; } },
  });
  assert.deepEqual(await notFound.startAssignment(7, 20), { status: "not-found" });

  const invalidController = createStudentAssignmentStartController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.startAssignment({
    params: { id: "invalid" },
    user: { id: 20 },
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const errorController = createStudentAssignmentStartController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.startAssignment({
      params: { id: "7" },
      user: { id: 20 },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Topshiriqni boshlash xatosi:", "database unavailable"]]);
});

test("student assignment start route preserves path and middleware order", () => {
  const router = studentAssignmentStartRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/assignments/:id/start");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
