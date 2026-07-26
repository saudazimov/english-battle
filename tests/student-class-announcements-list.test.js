const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStudentClassAnnouncementsListController,
} = require("../src/controllers/studentClassAnnouncementsListController");

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

test("student class announcements list rejects invalid id before membership lookup", async () => {
  let membershipCalls = 0;
  let queryCount = 0;
  const controller = createStudentClassAnnouncementsListController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async activeClassMembership() { membershipCalls += 1; return {}; },
  });
  const res = createResponse();

  await controller.list({ user: { id: 7 }, params: { classId: "invalid" } }, res);

  assert.equal(membershipCalls, 0);
  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri sinf ID" });
});

test("student class announcements list preserves membership rejection", async () => {
  const membershipCalls = [];
  const controller = createStudentClassAnnouncementsListController({
    pool: { async query() { throw new Error("must not query"); } },
    async activeClassMembership(classId, studentId) {
      membershipCalls.push([classId, studentId]);
      return null;
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 7 }, params: { classId: "42" } }, res);

  assert.deepEqual(membershipCalls, [[42, 7]]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Sinf topilmadi" });
});

test("student class announcements list preserves query and response", async () => {
  const announcements = [{ id: 1, title: "News", is_pinned: true }];
  const queries = [];
  const controller = createStudentClassAnnouncementsListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: announcements };
      },
    },
    async activeClassMembership(classId, studentId) {
      assert.deepEqual([classId, studentId], [42, 7]);
      return { id: 42 };
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 7 }, params: { classId: "42" } }, res);

  assert.deepEqual(queries, [{
    sql: `SELECT id, title, body, is_pinned, created_at
         FROM class_announcements WHERE class_id=$1
        ORDER BY is_pinned DESC, created_at DESC`,
    params: [42],
  }]);
  assert.deepEqual(res.body, { announcements });
});

test("student class announcements list preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createStudentClassAnnouncementsListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async activeClassMembership() { return { id: 42 }; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 7 }, params: { classId: "42" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["O'quvchi e'lonlari xatosi:", "database unavailable"]]);
});
