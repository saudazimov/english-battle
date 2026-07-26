const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherConversationMessagesListController,
} = require("../src/controllers/teacherConversationMessagesListController");

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

test("teacher conversation messages list rejects invalid student id before lookup", async () => {
  let linkedCalls = 0;
  let queryCount = 0;
  const controller = createTeacherConversationMessagesListController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    async teacherStudentLinked() { linkedCalls += 1; return true; },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { studentId: "invalid" } }, res);

  assert.equal(linkedCalls, 0);
  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Bu o'quvchi sizning sinfingizda emas" });
});

test("teacher conversation messages list preserves linked-student rejection", async () => {
  const linkedCalls = [];
  const controller = createTeacherConversationMessagesListController({
    pool: { async query() { throw new Error("must not query"); } },
    async teacherStudentLinked(teacherId, studentId) {
      linkedCalls.push([teacherId, studentId]);
      return false;
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { studentId: "7" } }, res);

  assert.deepEqual(linkedCalls, [[42, 7]]);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Bu o'quvchi sizning sinfingizda emas" });
});

test("teacher conversation messages list preserves update, select and response", async () => {
  const rows = [{ id: "11", sender_id: 7, message: "Salom", read_at: null }];
  const queries = [];
  const controller = createTeacherConversationMessagesListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1 ? { rows: [] } : { rows };
      },
    },
    async teacherStudentLinked(teacherId, studentId) {
      assert.deepEqual([teacherId, studentId], [42, 7]);
      return true;
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { studentId: "7" } }, res);

  assert.deepEqual(queries, [
    {
      sql: "UPDATE teacher_messages SET read_at=NOW() WHERE teacher_id=$1 AND student_id=$2 AND sender_id=$2 AND read_at IS NULL",
      params: [42, 7],
    },
    {
      sql: `SELECT * FROM (
         SELECT id, sender_id, message, read_at, created_at FROM teacher_messages
         WHERE teacher_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 200
       ) recent ORDER BY created_at ASC`,
      params: [42, 7],
    },
  ]);
  assert.deepEqual(res.body, { messages: rows });
});

test("teacher conversation messages list preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherConversationMessagesListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    async teacherStudentLinked() { return true; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { studentId: "7" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher messages xatosi:", "database unavailable"]]);
});
