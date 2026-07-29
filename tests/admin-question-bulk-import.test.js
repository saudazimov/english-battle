const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin } = require("../auth");
const {
  createAdminQuestionBulkImportService,
} = require("../src/services/adminQuestionBulkImportService");
const {
  createAdminQuestionBulkImportController,
} = require("../src/controllers/adminQuestionBulkImportController");
const adminQuestionBulkImportRoutes = require("../src/routes/adminQuestionBulkImportRoutes");

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

function question(text, overrides = {}) {
  return {
    question_text: text,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
    ...overrides,
  };
}

test("bulk import preserves validation, duplicate checks, sequential inserts, and errors", async () => {
  const queries = [];
  let insertNumber = 0;
  const service = createAdminQuestionBulkImportService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        if (sql.startsWith("SELECT")) return { rows: [{ qt: "existing question" }] };
        insertNumber++;
        if (insertNumber === 2) throw new Error("insert failed");
        return { rows: [] };
      },
    },
  });
  const rows = [
    question("  New Question  ", { cefr_level: "b1", skill: "Vocabulary", status: "draft" }),
    question("Existing Question"),
    question("new question"),
    question("x", { option_a: "" }),
    question("Bad answer", { correct_option: "E" }),
    question("Another Question", { cefr_level: "invalid", status: "invalid" }),
  ];

  assert.deepEqual(await service.importRows(rows), {
    status: "imported",
    inserted: 1,
    skipped: 5,
    total: 6,
    errors: ["Qator 6: insert failed"],
  });
  assert.equal(queries.length, 3);
  assert.equal(queries[0].sql, "SELECT LOWER(TRIM(question_text)) AS qt FROM questions");
  assert.deepEqual(queries[1].params, [
    "New Question", "A", "B", "C", "D", "A", "B1", "vocabulary", "", "draft",
  ]);
  assert.deepEqual(queries[2].params, [
    "Another Question", "A", "B", "C", "D", "A", "A1", "grammar", "", "published",
  ]);
});

test("bulk import preserves empty and maximum row guards", async () => {
  const service = createAdminQuestionBulkImportService({
    pool: { query: assert.fail },
  });

  assert.deepEqual(await service.importRows(null), { status: "empty" });
  assert.deepEqual(await service.importRows([]), { status: "empty" });
  assert.deepEqual(
    await service.importRows(Array.from({ length: 1001 }, () => ({}))),
    { status: "too-many" }
  );
});

test("bulk import controller preserves audit order and response", async () => {
  const calls = [];
  const request = { body: { rows: [question("Question one")] }, admin: { id: 2 } };
  const controller = createAdminQuestionBulkImportController({
    pool: {
      async query(sql) {
        calls.push(sql.startsWith("SELECT") ? "select" : "insert");
        return { rows: [] };
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
    },
  });
  const response = createResponse();

  await controller.importQuestions(request, response);
  assert.deepEqual(response.body, { inserted: 1, skipped: 0, total: 1, errors: [] });
  assert.deepEqual(calls, [
    "select",
    "insert",
    ["audit", request, "bulk_import_completed", {
      entityType: "question",
      details: "1 qo'shildi, 0 o'tkazib yuborildi",
    }],
  ]);
});

test("bulk import controller preserves validation and database error responses", async () => {
  const validationController = createAdminQuestionBulkImportController({
    pool: { query: assert.fail },
    logAudit: assert.fail,
  });
  const validationResponse = createResponse();
  await validationController.importQuestions({ body: { rows: [] } }, validationResponse);
  assert.equal(validationResponse.statusCode, 400);
  assert.deepEqual(validationResponse.body, { error: "Import uchun qatorlar yo'q" });

  const errorController = createAdminQuestionBulkImportController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logAudit: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.importQuestions(
      { body: { rows: [question("Question one")] } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Bulk import xatosi:", "database unavailable"]]);
});

test("bulk import route preserves path and middleware order", () => {
  const router = adminQuestionBulkImportRoutes({
    pool: { query: assert.fail },
    logAudit: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/admin/questions/bulk-import");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, requireAdmin);
  assert.equal(layer.route.stack.length, 2);
});
