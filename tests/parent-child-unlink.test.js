const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireParent } = require("../auth");
const {
  createParentChildUnlinkService,
} = require("../src/services/parentChildUnlinkService");
const {
  createParentChildUnlinkController,
} = require("../src/controllers/parentChildUnlinkController");
const parentChildUnlinkRoutes = require("../src/routes/parentChildUnlinkRoutes");

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

test("parent child unlink preserves SQL and active-link filter", async () => {
  const queries = [];
  const service = createParentChildUnlinkService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [{ id: 8 }] };
      },
    },
  });

  assert.equal(await service.unlinkChild(3, 11), true);
  assert.deepEqual(queries, [{
    sql: "UPDATE parent_links SET status='revoked', revoked_at=NOW(), revoked_by=$1, updated_at=NOW() WHERE parent_id=$1 AND student_id=$2 AND status='active' RETURNING id",
    params: [3, 11],
  }]);
});

test("parent child unlink preserves missing-link result", async () => {
  const service = createParentChildUnlinkService({
    pool: { async query() { return { rows: [] }; } },
  });

  assert.equal(await service.unlinkChild(3, 11), false);
});

test("parent child unlink controller preserves response behavior", async () => {
  const invalidController = createParentChildUnlinkController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.unlinkChild(
    { user: { id: 3 }, params: { studentId: "bad" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const missingController = createParentChildUnlinkController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.unlinkChild(
    { user: { id: 3 }, params: { studentId: "11" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Bog'lanish topilmadi" });

  const successController = createParentChildUnlinkController({
    pool: { async query() { return { rows: [{ id: 8 }] }; } },
  });
  const successResponse = createResponse();
  await successController.unlinkChild(
    { user: { id: 3 }, params: { studentId: "11" } },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, { success: true });
});

test("parent child unlink preserves database error logging", async () => {
  const controller = createParentChildUnlinkController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.unlinkChild(
      { user: { id: 3 }, params: { studentId: "11" } },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Farzandni uzish xatosi:", "database unavailable"]]);
});

test("parent child unlink route preserves path and middleware order", () => {
  const router = parentChildUnlinkRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/parent/children/:studentId");
  assert.equal(layer.route.methods.delete, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireParent);
  assert.equal(layer.route.stack.length, 3);
});
