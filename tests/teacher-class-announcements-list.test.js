const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassAnnouncementsListController,
} = require("../src/controllers/teacherClassAnnouncementsListController");

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

test("teacher class announcements list rejects invalid id before ownership lookup", async () => {
  let ownershipCalls = 0;
  let queryCount = 0;
  const controller = createTeacherClassAnnouncementsListController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async ownedActiveClass() { ownershipCalls += 1; return {}; },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { classId: "invalid" } }, res);

  assert.equal(ownershipCalls, 0);
  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri sinf ID" });
});

test("teacher class announcements list preserves ownership rejection", async () => {
  const ownershipCalls = [];
  const controller = createTeacherClassAnnouncementsListController({
    pool: { async query() { throw new Error("must not query"); } },
    async ownedActiveClass(classId, teacherId) {
      ownershipCalls.push([classId, teacherId]);
      return null;
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { classId: "7" } }, res);

  assert.deepEqual(ownershipCalls, [[7, 42]]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Sinf topilmadi" });
});

test("teacher class announcements list preserves query and response", async () => {
  const announcements = [{ id: 1, title: "News", is_pinned: true }];
  const queries = [];
  const controller = createTeacherClassAnnouncementsListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: announcements };
      },
    },
    async ownedActiveClass(classId, teacherId) {
      assert.deepEqual([classId, teacherId], [7, 42]);
      return { id: 7 };
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { classId: "7" } }, res);

  assert.deepEqual(queries, [{
    sql: `SELECT id, title, body, is_pinned, created_at, updated_at
         FROM class_announcements WHERE class_id=$1
        ORDER BY is_pinned DESC, created_at DESC`,
    params: [7],
  }]);
  assert.deepEqual(res.body, { announcements });
});

test("teacher class announcements list preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherClassAnnouncementsListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async ownedActiveClass() { return { id: 7 }; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { classId: "7" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Sinf e'lonlari xatosi:", "database unavailable"]]);
});
