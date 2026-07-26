const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherConversationMessageSendController,
} = require("../src/controllers/teacherConversationMessageSendController");

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

function createDependencies(overrides = {}) {
  return {
    pool: { async query() { throw new Error("must not query"); } },
    async teacherStudentLinked() { return true; },
    sanitizeText(value) { return value; },
    filterProfanity(value) { return value; },
    onlineUsers: {},
    io: { to() { throw new Error("must not emit"); } },
    async createNotification() { throw new Error("must not notify"); },
    ...overrides,
  };
}

test("teacher conversation message send rejects invalid student id before lookup", async () => {
  let linkedCalls = 0;
  const controller = createTeacherConversationMessageSendController(createDependencies({
    async teacherStudentLinked() { linkedCalls += 1; return true; },
  }));
  const res = createResponse();

  await controller.send({
    user: { id: 42 }, params: { studentId: "invalid" }, body: { message: "Salom" },
  }, res);

  assert.equal(linkedCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Bu o'quvchi sizning sinfingizda emas" });
});

test("teacher conversation message send preserves sanitization and empty-message response", async () => {
  const calls = [];
  const controller = createTeacherConversationMessageSendController(createDependencies({
    sanitizeText(value, maxLength) {
      calls.push(["sanitize", value, maxLength]);
      return "";
    },
    filterProfanity(value) {
      calls.push(["filter", value]);
      return value;
    },
  }));
  const res = createResponse();

  await controller.send({
    user: { id: 42 }, params: { studentId: "7" }, body: { message: "" },
  }, res);

  assert.deepEqual(calls, [["sanitize", "", 1000], ["filter", ""]]);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Xabar bo'sh" });
});

test("teacher conversation message send preserves SQL, socket, notification and response order", async () => {
  const savedMessage = { id: "11", sender_id: 42, message: "Salom" };
  const events = [];
  const queries = [];
  const onlineUsers = { "7": "socket-7" };
  const controller = createTeacherConversationMessageSendController(createDependencies({
    pool: {
      async query(sql, params) {
        events.push("query");
        queries.push({ sql, params });
        return { rows: [savedMessage] };
      },
    },
    async teacherStudentLinked(teacherId, studentId) {
      assert.deepEqual([teacherId, studentId], [42, 7]);
      return true;
    },
    sanitizeText(value, maxLength) {
      assert.deepEqual([value, maxLength], [" raw ", 1000]);
      return "raw";
    },
    filterProfanity(value) {
      assert.equal(value, "raw");
      return "Salom";
    },
    onlineUsers,
    io: {
      to(socketId) {
        events.push(["to", socketId]);
        return {
          emit(name, payload) {
            events.push(["emit", name, payload]);
          },
        };
      },
    },
    async createNotification(...args) {
      events.push(["notification", ...args]);
    },
  }));
  const res = createResponse();

  await controller.send({
    user: { id: 42 }, params: { studentId: "7" }, body: { message: " raw " },
  }, res);

  assert.deepEqual(queries, [{
    sql: `INSERT INTO teacher_messages (teacher_id, student_id, sender_id, message)
       VALUES ($1,$2,$1,$3) RETURNING id, sender_id, message, read_at, created_at`,
    params: [42, 7, "Salom"],
  }]);
  assert.deepEqual(events, [
    "query",
    ["to", "socket-7"],
    ["emit", "teacherMessage", { teacher_id: 42, message: savedMessage }],
    ["notification", 7, "teacher_message", "O'qituvchingizdan yangi xabar keldi"],
  ]);
  assert.deepEqual(res.body, { message: savedMessage });
});

test("teacher conversation message send preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherConversationMessageSendController(createDependencies({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  }));
  const res = createResponse();

  await controller.send({
    user: { id: 42 }, params: { studentId: "7" }, body: { message: "Salom" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher message send xatosi:", "database unavailable"]]);
});
