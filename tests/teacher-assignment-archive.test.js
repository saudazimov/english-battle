const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherAssignmentArchiveService,
} = require("../src/services/teacherAssignmentArchiveService");
const {
  createTeacherAssignmentArchiveController,
} = require("../src/controllers/teacherAssignmentArchiveController");
const teacherAssignmentArchiveRoutes = require("../src/routes/teacherAssignmentArchiveRoutes");

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

test("teacher assignment archive preserves SQL and ownership filter", async () => {
  const queries = [];
  const service = createTeacherAssignmentArchiveService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [{ id: 17 }] };
      },
    },
  });

  assert.equal(await service.archiveAssignment(17, 4), true);
  assert.deepEqual(queries, [{
    sql: "UPDATE assignments SET status='archived', archived_at=NOW(), updated_at=NOW() WHERE id=$1 AND teacher_id=$2 RETURNING id",
    params: [17, 4],
  }]);
});

test("teacher assignment archive preserves missing assignment result", async () => {
  const service = createTeacherAssignmentArchiveService({
    pool: { async query() { return { rows: [] }; } },
  });

  assert.equal(await service.archiveAssignment(17, 4), false);
});

test("teacher assignment archive controller preserves response behavior", async () => {
  const invalidController = createTeacherAssignmentArchiveController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.archiveAssignment(
    { user: { id: 4 }, params: { id: "bad" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const missingController = createTeacherAssignmentArchiveController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.archiveAssignment(
    { user: { id: 4 }, params: { id: "17" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Topshiriq topilmadi" });

  const successController = createTeacherAssignmentArchiveController({
    pool: { async query() { return { rows: [{ id: 17 }] }; } },
  });
  const successResponse = createResponse();
  await successController.archiveAssignment(
    { user: { id: 4 }, params: { id: "17" } },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, {
    success: true,
    message: "Topshiriq arxivlandi",
  });
});

test("teacher assignment archive preserves database error logging", async () => {
  const controller = createTeacherAssignmentArchiveController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.archiveAssignment(
      { user: { id: 4 }, params: { id: "17" } },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Topshiriq arxivlash xatosi:", "database unavailable"]]);
});

test("teacher assignment archive route preserves path and middleware order", () => {
  const router = teacherAssignmentArchiveRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/assignments/:id/archive");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
