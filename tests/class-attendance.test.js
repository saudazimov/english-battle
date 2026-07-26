const test = require("node:test");
const assert = require("node:assert/strict");

const {
  authMiddleware,
  requireStudent,
  requireTeacher,
} = require("../auth");
const {
  createClassAttendanceController,
} = require("../src/controllers/classAttendanceController");
const createClassAttendanceRoutes = require("../src/routes/classAttendanceRoutes");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

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

function createHarness({
  poolResults = [],
  clientResults = [],
  poolError,
  clientErrorAt = -1,
} = {}) {
  const calls = [];
  let poolIndex = 0;
  let clientIndex = 0;
  const client = {
    async query(sql, params) {
      const currentIndex = clientIndex++;
      calls.push(["clientQuery", normalizeSql(sql), params]);
      if (currentIndex === clientErrorAt) throw new Error("client failed");
      return clientResults[currentIndex] || { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const dependencies = {
    pool: {
      async query(sql, params) {
        calls.push(["poolQuery", normalizeSql(sql), params]);
        if (poolError) throw poolError;
        return poolResults[poolIndex++] || { rows: [] };
      },
      async connect() {
        calls.push(["connect"]);
        return client;
      },
    },
    sanitizeText(value, maxLength) {
      calls.push(["sanitize", value, maxLength]);
      return String(value).trim();
    },
    async ownedActiveClass(classId, teacherId) {
      calls.push(["ownedActiveClass", classId, teacherId]);
      return { id: classId };
    },
    async activeClassMembership(classId, studentId) {
      calls.push(["activeClassMembership", classId, studentId]);
      return { id: classId };
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
  };
  return {
    calls,
    controller: createClassAttendanceController(dependencies),
    dependencies,
  };
}

test("teacher attendance list preserves queries and selected session fallback", async () => {
  const sessions = [{ id: "11", title: "Morning" }];
  const students = [{ id: 9, first_name: "Ali" }];
  const records = [{ student_id: 9, status: "present" }];
  const harness = createHarness({
    poolResults: [
      { rows: sessions },
      { rows: students },
      { rows: records },
    ],
  });
  const response = createResponse();

  await harness.controller.listTeacherAttendance(
    {
      user: { id: 7 },
      params: { classId: "42abc" },
      query: { sessionId: "invalid" },
    },
    response
  );

  assert.equal(harness.calls[0][0], "ownedActiveClass");
  assert.equal(harness.calls[1][1].includes("COUNT(r.id)::int"), true);
  assert.deepEqual(harness.calls[1][2], [42]);
  assert.equal(harness.calls[2][1].includes("FROM class_students cs"), true);
  assert.deepEqual(harness.calls[3][2], [11, 42]);
  assert.deepEqual(response.body, {
    sessions,
    students,
    selected_session_id: 11,
    records,
  });
});

test("teacher attendance create preserves sanitizing, defaults, SQL, and response", async () => {
  const session = { id: 11, title: "Dars davomati" };
  const harness = createHarness({ poolResults: [{ rows: [session] }] });
  const response = createResponse();

  await harness.controller.createTeacherAttendance(
    {
      user: { id: 7 },
      params: { classId: "42" },
      body: { title: "   ", session_date: "bad-date" },
    },
    response
  );

  assert.deepEqual(harness.calls, [
    ["sanitize", "   ", 160],
    ["ownedActiveClass", 42, 7],
    [
      "poolQuery",
      "INSERT INTO class_attendance_sessions (class_id, teacher_id, title, session_date) VALUES ($1,$2,$3,COALESCE($4::date,CURRENT_DATE)) RETURNING id, title, session_date, status, created_at",
      [42, 7, "Dars davomati", null],
    ],
  ]);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { session });
});

test("teacher attendance update connects before validation and always releases", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.updateTeacherAttendance(
    {
      user: { id: 7 },
      params: { classId: "invalid", sessionId: "3" },
      body: { records: [{ student_id: 9, status: "present" }] },
    },
    response
  );

  assert.deepEqual(harness.calls, [["connect"], ["release"]]);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri ID" });
});

test("teacher attendance update preserves transaction, socket event, and response", async () => {
  const harness = createHarness({
    clientResults: [
      { rows: [{ id: 3, status: "open" }] },
      { rows: [{ student_id: "9" }, { student_id: 10 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ],
  });
  const response = createResponse();

  await harness.controller.updateTeacherAttendance(
    {
      user: { id: 7 },
      params: { classId: "42", sessionId: "3" },
      body: {
        records: [
          { student_id: "9", status: "present" },
          { student_id: 10, status: "late" },
        ],
        close: true,
      },
    },
    response
  );

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "connect",
    "ownedActiveClass",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "room",
    "emit",
    "release",
  ]);
  assert.deepEqual(harness.calls[2][2], [3, 42, 7]);
  assert.deepEqual(harness.calls[3][2], [42]);
  assert.equal(harness.calls[4][1], "BEGIN");
  assert.deepEqual(harness.calls[5][2], [3, 9, "present"]);
  assert.deepEqual(harness.calls[6][2], [3, 10, "late"]);
  assert.deepEqual(harness.calls[7][2], [3]);
  assert.equal(harness.calls[8][1], "COMMIT");
  assert.deepEqual(harness.calls[10], [
    "emit",
    "classAttendanceUpdated",
    { classId: 42 },
  ]);
  assert.deepEqual(response.body, { success: true });
});

test("teacher attendance update preserves closed-session response", async () => {
  const harness = createHarness({
    clientResults: [{ rows: [{ id: 3, status: "closed" }] }],
  });
  const response = createResponse();

  await harness.controller.updateTeacherAttendance(
    {
      user: { id: 7 },
      params: { classId: "42", sessionId: "3" },
      body: { records: [{ student_id: 9, status: "present" }] },
    },
    response
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    error: "Yopilgan davomatni o'zgartirib bo'lmaydi",
  });
  assert.deepEqual(harness.calls.at(-1), ["release"]);
});

test("teacher attendance update preserves rollback, error log, and release", async () => {
  const harness = createHarness({ clientErrorAt: 0 });
  const response = createResponse();

  await harness.controller.updateTeacherAttendance(
    {
      user: { id: 7 },
      params: { classId: "42", sessionId: "3" },
      body: { records: [{ student_id: 9, status: "present" }] },
    },
    response
  );

  assert.equal(harness.calls.at(-3)[1], "ROLLBACK");
  assert.deepEqual(harness.calls.at(-2), [
    "error",
    "Davomat saqlash xatosi:",
    "client failed",
  ]);
  assert.deepEqual(harness.calls.at(-1), ["release"]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("student attendance preserves query and summary calculation", async () => {
  const records = [
    { id: 1, status: "present" },
    { id: 2, status: "absent" },
    { id: 3, status: "late" },
    { id: 4, status: null },
  ];
  const harness = createHarness({ poolResults: [{ rows: records }] });
  const response = createResponse();

  await harness.controller.listStudentAttendance(
    { user: { id: 9 }, params: { classId: "42" } },
    response
  );

  assert.deepEqual(harness.calls[0], ["activeClassMembership", 42, 9]);
  assert.deepEqual(harness.calls[1][2], [42, 9]);
  assert.deepEqual(response.body, {
    records,
    summary: { total: 3, attended: 2, percent: 67 },
  });
});

test("class attendance routes preserve paths, methods, and middleware order", () => {
  const harness = createHarness();
  const router = createClassAttendanceRoutes(harness.dependencies);
  const expected = [
    ["/teacher/classes/:classId/attendance", "get", requireTeacher],
    ["/teacher/classes/:classId/attendance", "post", requireTeacher],
    [
      "/teacher/classes/:classId/attendance/:sessionId",
      "put",
      requireTeacher,
    ],
    ["/student/classes/:classId/attendance", "get", requireStudent],
  ];

  assert.equal(router.stack.length, expected.length);
  expected.forEach(([path, method, roleMiddleware], index) => {
    const route = router.stack[index].route;
    assert.equal(route.path, path);
    assert.equal(route.methods[method], true);
    assert.equal(route.stack.length, 3);
    assert.equal(route.stack[0].handle, authMiddleware);
    assert.equal(route.stack[1].handle, roleMiddleware);
  });
});
