const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminQuestionUpdateController,
} = require("../src/controllers/adminQuestionUpdateController");
const createAdminQuestionUpdateRoutes = require("../src/routes/adminQuestionUpdateRoutes");

const validBody = {
  id: "42",
  question_text: "Updated question?",
  option_a: "A",
  option_b: "B",
  option_c: "C",
  option_d: "D",
  correct_option: "B",
};

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

function createHarness({ found = true, queryError, auditError } = {}) {
  const calls = [];
  const controller = createAdminQuestionUpdateController({
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return { rows: found ? [{ id: 42 }] : [] };
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
      if (auditError) throw auditError;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
    questionAnalysisService: {
      async enqueueSafe(id, reason) {
        calls.push(["analysis", id, reason]);
        return true;
      },
      async getAnalysis() { return null; },
      async listReviewQueue(options) {
        calls.push(["reviewQueue", options]);
        return { items: [], total: 0, ...options };
      },
      async review() { return null; },
      async enqueue() { return false; },
      async processBatchSafe() {},
    },
  });
  return { calls, controller };
}

test("admin question update preserves validation responses", async () => {
  const cases = [
    [{ ...validBody, id: "" }, { error: "Savol ID kerak" }],
    [{ ...validBody, option_c: "" }, { error: "Barcha maydonlarni to'ldiring" }],
    [
      { ...validBody, correct_option: "E" },
      { error: "To'g'ri javob A, B, C yoki D bo'lishi kerak" },
    ],
  ];

  for (const [body, expectedBody] of cases) {
    const harness = createHarness();
    const response = createResponse();
    const result = await harness.controller.update({ body }, response);

    assert.equal(result, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, expectedBody);
    assert.deepEqual(harness.calls, []);
  }
});

test("admin question update preserves defaults, SQL, audit, and response order", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = { body: { ...validBody } };

  await harness.controller.update(request, response);

  assert.deepEqual(harness.calls, [
    [
      "query",
      "UPDATE questions SET question_text = $1, option_a = $2, option_b = $3, option_c = $4, option_d = $5, correct_option = $6, cefr_level = $7, skill = $8, explanation = $9, status = $10, updated_at = NOW() WHERE id = $11 RETURNING id",
      ["Updated question?", "A", "B", "C", "D", "B", "A1", "grammar", "", "published", "42"],
    ],
    [
      "audit",
      request,
      "question_updated",
      { entityType: "question", entityId: "42", details: "A1 · grammar" },
    ],
    ["analysis", "42", "question_updated"],
  ]);
  assert.deepEqual(response.body, { message: "Savol yangilandi!", id: "42" });
});

test("admin question update preserves custom values and invalid-status fallback", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = {
    body: {
      ...validBody,
      cefr_level: "C1",
      skill: "listening",
      explanation: "Explanation",
      status: "invalid",
    },
  };

  await harness.controller.update(request, response);

  assert.deepEqual(harness.calls[0][2].slice(6), [
    "C1",
    "listening",
    "Explanation",
    "published",
    "42",
  ]);
  assert.deepEqual(harness.calls[1][3], {
    entityType: "question",
    entityId: "42",
    details: "C1 · listening",
  });
});

test("admin question update preserves not-found response before audit", async () => {
  const harness = createHarness({ found: false });
  const response = createResponse();

  const result = await harness.controller.update({ body: validBody }, response);

  assert.equal(result, response);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0][0], "query");
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Savol topilmadi" });
});

test("admin question update preserves database and audit error handling", async () => {
  const queryHarness = createHarness({ queryError: new Error("database failed") });
  const queryResponse = createResponse();
  await queryHarness.controller.update({ body: validBody }, queryResponse);

  assert.deepEqual(queryHarness.calls.map((call) => call[0]), ["query", "error"]);
  assert.deepEqual(queryHarness.calls.at(-1), [
    "error",
    "Savol tahrirlash xatosi:",
    "database failed",
  ]);
  assert.equal(queryResponse.statusCode, 500);
  assert.deepEqual(queryResponse.body, { error: "Server xatosi" });

  const auditHarness = createHarness({ auditError: new Error("audit failed") });
  const auditResponse = createResponse();
  await auditHarness.controller.update({ body: validBody }, auditResponse);

  assert.deepEqual(auditHarness.calls.map((call) => call[0]), ["query", "audit", "error"]);
  assert.deepEqual(auditHarness.calls.at(-1), [
    "error",
    "Savol tahrirlash xatosi:",
    "audit failed",
  ]);
  assert.equal(auditResponse.statusCode, 500);
  assert.deepEqual(auditResponse.body, { error: "Server xatosi" });
});

test("admin question update route preserves path, method, and middleware order", () => {
  const router = createAdminQuestionUpdateRoutes({ pool: {}, logAudit() {} });

  assert.equal(router.stack.length, 5);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/questions/edit");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
  assert.deepEqual(router.stack.map((layer) => layer.route.path), [
    "/admin/questions/edit",
    "/admin/questions/analysis/review-queue",
    "/admin/questions/:id/analysis",
    "/admin/questions/:id/analysis/review",
    "/admin/questions/:id/analysis/requeue",
  ]);
  assert.equal(router.stack[1].route.methods.get, true);
  assert.equal(router.stack[1].route.stack[0].handle, requireAdmin);
});

test("admin question analysis review queue forwards validated query and response", async () => {
  const harness = createHarness();
  const response = createResponse();
  const query = { filter: "quarantined", limit: "20", offset: "0" };

  await harness.controller.listAnalysisReviewQueue({ query }, response);

  assert.deepEqual(harness.calls, [["reviewQueue", query]]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { items: [], total: 0, ...query });
});
