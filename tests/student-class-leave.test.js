const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentClassLeaveController,
} = require("../src/controllers/studentClassLeaveController");
const createStudentClassLeaveRoutes = require("../src/routes/studentClassLeaveRoutes");

const leaveSql =
  "UPDATE class_students SET status='left' WHERE class_id=$1 AND student_id=$2 AND status='active'";

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

function createHarness({ membership = { id: 1 }, queryError } = {}) {
  const calls = [];
  const controller = createStudentClassLeaveController({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return { rowCount: 1 };
      },
    },
    async activeClassMembership(classId, studentId) {
      calls.push(["membership", classId, studentId]);
      return membership;
    },
    io: {
      to(room) {
        calls.push(["room", room]);
        return {
          emit(event, payload) {
            calls.push(["emit", event, payload]);
          },
        };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

test("student class leave rejects invalid ID before dependencies", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.leave(
    { user: { id: 7 }, params: { classId: "invalid" } },
    response
  );

  assert.deepEqual(harness.calls, []);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri sinf ID" });
});

test("student class leave preserves membership rejection", async () => {
  const harness = createHarness({ membership: null });
  const response = createResponse();

  await harness.controller.leave(
    { user: { id: 7 }, params: { classId: "42abc" } },
    response
  );

  assert.deepEqual(harness.calls, [["membership", 42, 7]]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Siz bu sinfda emassiz" });
});

test("student class leave preserves SQL, socket event, and response order", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.leave(
    { user: { id: 7 }, params: { classId: "42" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["membership", 42, 7],
    ["query", leaveSql, [42, 7]],
    ["room", "class_42"],
    ["emit", "classStudentLeft", { classId: 42, studentId: 7 }],
  ]);
  assert.deepEqual(response.body, {
    success: true,
    message: "Sinf tark etildi",
  });
});

test("student class leave preserves database error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.leave(
    { user: { id: 7 }, params: { classId: "42" } },
    response
  );

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Sinfni tark etish xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.equal(harness.calls.some((call) => call[0] === "emit"), false);
});

test("student class leave route preserves path, method, and middleware order", () => {
  const router = createStudentClassLeaveRoutes({
    pool: {},
    activeClassMembership() {},
    io: {},
  });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/student/classes/:classId/leave");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
});
