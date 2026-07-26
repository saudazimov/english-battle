const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStudentTeacherMessageSendController,
} = require("../src/controllers/studentTeacherMessageSendController");

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

test("student teacher message send rejects invalid teacher id before lookup", async () => {
  let linkedCalls = 0;
  const controller = createStudentTeacherMessageSendController(createDependencies({
    async teacherStudentLinked() { linkedCalls += 1; return true; },
  }));
  const res = createResponse();

  await controller.send({
    user: { id: 7 }, params: { teacherId: "invalid" }, body: { message: "Salom" },
  }, res);

  assert.equal(linkedCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Bu o'qituvchi sizning sinfingizga tegishli emas" });
});

test("student teacher message send preserves nested sanitization and empty response", async () => {
  const calls = [];
  const controller = createStudentTeacherMessageSendController(createDependencies({
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
    user: { id: 7 }, params: { teacherId: "42" }, body: { message: "" },
  }, res);

  assert.deepEqual(calls, [["sanitize", "", 1000], ["filter", ""]]);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Xabar bo'sh" });
});

test("student teacher message send preserves SQL, socket, notification and response order", async () => {
  const savedMessage = { id: "11", sender_id: 7, message: "Salom" };
  const events = [];
  const queries = [];
  const controller = createStudentTeacherMessageSendController(createDependencies({
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
    onlineUsers: { "42": "socket-42" },
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
    user: { id: 7 }, params: { teacherId: "42" }, body: { message: " raw " },
  }, res);

  assert.deepEqual(queries, [{
    sql: `INSERT INTO teacher_messages (teacher_id, student_id, sender_id, message)
       VALUES ($1,$2,$2,$3) RETURNING id, sender_id, message, read_at, created_at`,
    params: [42, 7, "Salom"],
  }]);
  assert.deepEqual(events, [
    "query",
    ["to", "socket-42"],
    ["emit", "teacherMessage", { student_id: 7, message: savedMessage }],
    ["notification", 42, "student_message", "O'quvchingizdan yangi xabar keldi"],
  ]);
  assert.deepEqual(res.body, { message: savedMessage });
});

test("student teacher message send preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createStudentTeacherMessageSendController(createDependencies({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  }));
  const res = createResponse();

  await controller.send({
    user: { id: 7 }, params: { teacherId: "42" }, body: { message: "Salom" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Student teacher message xatosi:", "database unavailable"]]);
});
