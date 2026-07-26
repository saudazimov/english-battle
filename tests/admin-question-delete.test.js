const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminQuestionDeleteController,
} = require("../src/controllers/adminQuestionDeleteController");
const createAdminQuestionDeleteRoutes = require("../src/routes/adminQuestionDeleteRoutes");

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

function createHarness({ queryError, auditError } = {}) {
  const calls = [];
  const controller = createAdminQuestionDeleteController({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
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
  });
  return { calls, controller };
}

test("admin question delete preserves missing-ID validation", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.remove({ body: {} }, response);

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Savol ID kerak" });
  assert.deepEqual(harness.calls, []);
});

test("admin question delete preserves query, audit, and response order", async () => {
  const request = { body: { id: "42" }, admin: { name: "Admin" } };
  const harness = createHarness();
  const response = createResponse();

  assert.equal(await harness.controller.remove(request, response), undefined);

  assert.deepEqual(harness.calls, [
    ["query", "DELETE FROM questions WHERE id = $1", ["42"]],
    ["audit", request, "question_deleted", { entityType: "question", entityId: "42" }],
  ]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { message: "Savol o'chirildi!" });
});

test("admin question delete preserves database-error response before audit", async () => {
  const harness = createHarness({ queryError: new Error("delete failed") });
  const response = createResponse();

  assert.equal(await harness.controller.remove({ body: { id: 3 } }, response), undefined);

  assert.deepEqual(harness.calls.map((call) => call[0]), ["query", "error"]);
  assert.deepEqual(harness.calls.at(-1), ["error", "Savol o'chirish xatosi:", "delete failed"]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question delete preserves 500 response when audit fails after deletion", async () => {
  const harness = createHarness({ auditError: new Error("audit failed") });
  const response = createResponse();

  assert.equal(await harness.controller.remove({ body: { id: 3 } }, response), undefined);

  assert.deepEqual(harness.calls.map((call) => call[0]), ["query", "audit", "error"]);
  assert.deepEqual(harness.calls.at(-1), ["error", "Savol o'chirish xatosi:", "audit failed"]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question delete route preserves path, method, and middleware order", () => {
  const router = createAdminQuestionDeleteRoutes({ pool: {}, logAudit() {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/questions/delete");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
