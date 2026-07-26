const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassAnnouncementDeleteController,
} = require("../src/controllers/teacherClassAnnouncementDeleteController");

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

function createIo(events) {
  return {
    to(room) {
      events.push(["to", room]);
      return {
        emit(name, payload) {
          events.push(["emit", name, payload]);
        },
      };
    },
  };
}

test("teacher class announcement delete rejects invalid ids before ownership lookup", async () => {
  let ownershipCalls = 0;
  let queryCount = 0;
  const controller = createTeacherClassAnnouncementDeleteController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async ownedActiveClass() { ownershipCalls += 1; return {}; },
    io: createIo([]),
  });
  const res = createResponse();

  await controller.remove({
    user: { id: 42 }, params: { classId: "invalid", announcementId: "invalid" },
  }, res);

  assert.equal(ownershipCalls, 0);
  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri ID" });
});

test("teacher class announcement delete preserves ownership rejection", async () => {
  const controller = createTeacherClassAnnouncementDeleteController({
    pool: { async query() { throw new Error("must not query"); } },
    async ownedActiveClass(classId, teacherId) {
      assert.deepEqual([classId, teacherId], [7, 42]);
      return null;
    },
    io: createIo([]),
  });
  const res = createResponse();

  await controller.remove({
    user: { id: 42 }, params: { classId: "7", announcementId: "9" },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Sinf topilmadi" });
});

test("teacher class announcement delete preserves delete not-found response", async () => {
  const queries = [];
  const events = [];
  const controller = createTeacherClassAnnouncementDeleteController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
    async ownedActiveClass() { return { id: 7 }; },
    io: createIo(events),
  });
  const res = createResponse();

  await controller.remove({
    user: { id: 42 }, params: { classId: "7", announcementId: "9" },
  }, res);

  assert.deepEqual(queries, [{
    sql: "DELETE FROM class_announcements WHERE id=$1 AND class_id=$2 AND teacher_id=$3 RETURNING id",
    params: [9, 7, 42],
  }]);
  assert.deepEqual(events, []);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "E'lon topilmadi" });
});

test("teacher class announcement delete preserves socket emit and success response", async () => {
  const events = [];
  const controller = createTeacherClassAnnouncementDeleteController({
    pool: { async query() { return { rows: [{ id: 9 }] }; } },
    async ownedActiveClass() { return { id: 7 }; },
    io: createIo(events),
  });
  const res = createResponse();

  await controller.remove({
    user: { id: 42 }, params: { classId: "7", announcementId: "9" },
  }, res);

  assert.deepEqual(events, [
    ["to", "class_7"],
    ["emit", "classAnnouncementUpdated", { classId: 7 }],
  ]);
  assert.deepEqual(res.body, { success: true });
});

test("teacher class announcement delete preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherClassAnnouncementDeleteController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async ownedActiveClass() { return { id: 7 }; },
    io: createIo([]),
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.remove({
    user: { id: 42 }, params: { classId: "7", announcementId: "9" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["E'lon o'chirish xatosi:", "database unavailable"]]);
});
