const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentClassJoinService,
} = require("../src/services/studentClassJoinService");
const {
  createStudentClassJoinController,
} = require("../src/controllers/studentClassJoinController");
const studentClassJoinRoutes = require("../src/routes/studentClassJoinRoutes");

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

function createIo(calls) {
  return {
    to(room) {
      calls.push(["room", room]);
      return {
        emit(event, payload) {
          calls.push(["emit", event, payload]);
        },
      };
    },
  };
}

function allowedPremium(calls = []) {
  return {
    async checkTeacherLimit(...args) {
      calls.push(["limit", ...args]);
      return { allowed: true };
    },
  };
}

test("student class join preserves validation before dependencies", async () => {
  const controller = createStudentClassJoinController({
    pool: { query: assert.fail },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
    io: {},
  });

  const missingResponse = createResponse();
  await controller.joinClass(
    { user: { id: 7 }, body: {} },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Qo'shilish kodini kiriting" });

  const shortResponse = createResponse();
  await controller.joinClass(
    { user: { id: 7 }, body: { join_code: " abc " } },
    shortResponse
  );
  assert.equal(shortResponse.statusCode, 400);
  assert.deepEqual(shortResponse.body, { error: "Kod 6 belgidan iborat bo'lishi kerak" });
});

test("student class join preserves class and existing membership guards", async () => {
  const missingService = createStudentClassJoinService({
    pool: { async query() { return { rows: [] }; } },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
    io: {},
  });
  assert.deepEqual(await missingService.joinClass({ studentId: 7, joinCode: "ABCDEF" }), {
    status: "class-not-found",
  });

  const inactiveService = createStudentClassJoinService({
    pool: { async query() { return { rows: [{ id: 4, archived_at: new Date() }] }; } },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
    io: {},
  });
  assert.deepEqual(await inactiveService.joinClass({ studentId: 7, joinCode: "ABCDEF" }), {
    status: "class-inactive",
  });

  const responses = [
    { rows: [{ id: 4, name: "B1", teacher_id: 2, archived_at: null }] },
    { rows: [{ id: 12, status: "active" }] },
  ];
  const memberService = createStudentClassJoinService({
    pool: { async query() { return responses.shift(); } },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
    io: {},
  });
  assert.deepEqual(await memberService.joinClass({ studentId: 7, joinCode: "ABCDEF" }), {
    status: "already-member",
  });
});

test("student class join preserves reactivation SQL and socket event order", async () => {
  const calls = [];
  const classRow = { id: 4, name: "B1", teacher_id: 2, archived_at: null };
  const responses = [
    { rows: [classRow] },
    { rows: [{ id: 12, status: "left" }] },
    { rows: [] },
  ];
  const service = createStudentClassJoinService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        return responses.shift();
      },
    },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
    io: createIo(calls),
  });

  assert.deepEqual(await service.joinClass({ studentId: 7, joinCode: "ABCDEF" }), {
    status: "rejoined",
    class: classRow,
  });
  assert.deepEqual(calls, [
    ["query", "SELECT id, name, teacher_id, archived_at FROM classes WHERE join_code = $1", ["ABCDEF"]],
    ["query", "SELECT id, status FROM class_students WHERE class_id = $1 AND student_id = $2", [4, 7]],
    ["query", "UPDATE class_students SET status = 'active', joined_at = NOW() WHERE id = $1", [12]],
    ["room", "class_4"],
    ["emit", "classStudentJoined", { classId: 4 }],
  ]);
});

test("student class join preserves premium limit audit and response", async () => {
  const audits = [];
  const responses = [
    { rows: [{ id: 4, name: "B1", teacher_id: 2, archived_at: null }] },
    { rows: [] },
  ];
  const controller = createStudentClassJoinController({
    pool: { async query() { return responses.shift(); } },
    premium: {
      async checkTeacherLimit(teacherId, feature) {
        assert.equal(teacherId, 2);
        assert.equal(feature, "students");
        return { allowed: false, current: 15, limit: 15 };
      },
    },
    async logAudit(...args) {
      audits.push(args);
    },
    io: { to: assert.fail },
  });
  const req = { user: { id: 7 }, body: { join_code: " abcdef " } };
  const response = createResponse();

  await controller.joinClass(req, response);

  assert.equal(response.statusCode, 402);
  assert.deepEqual(response.body, {
    error: "teacher_pro_required",
    feature: "more_students",
    message: "Bu sinfga qo'shilib bo'lmaydi — o'qituvchining bepul limiti to'lgan (15 o'quvchi).",
    upgrade_url: "/pricing.html?plan=teacher_pro",
  });
  assert.deepEqual(audits, [[req, "teacher_limit_blocked_student", {
    entityType: "class",
    entityId: 4,
    details: "teacher=2 count=15 limit=15 plan=free",
  }]]);
});

test("student class join preserves insert, socket event, and success response", async () => {
  const calls = [];
  const responses = [
    { rows: [{ id: 4, name: "B1", teacher_id: 2, archived_at: null }] },
    { rows: [] },
    { rows: [] },
  ];
  const controller = createStudentClassJoinController({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        return responses.shift();
      },
    },
    premium: allowedPremium(calls),
    logAudit: assert.fail,
    io: createIo(calls),
  });
  const response = createResponse();

  await controller.joinClass(
    { user: { id: 7 }, body: { join_code: " abcdef " } },
    response
  );

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, {
    message: "Sinfga muvaffaqiyatli qo'shildingiz",
    class: { id: 4, name: "B1" },
  });
  assert.deepEqual(calls, [
    ["query", "SELECT id, name, teacher_id, archived_at FROM classes WHERE join_code = $1", ["ABCDEF"]],
    ["query", "SELECT id, status FROM class_students WHERE class_id = $1 AND student_id = $2", [4, 7]],
    ["limit", 2, "students"],
    ["query", "INSERT INTO class_students (class_id, student_id, status) VALUES ($1, $2, 'active')", [4, 7]],
    ["room", "class_4"],
    ["emit", "classStudentJoined", { classId: 4 }],
  ]);
});

test("student class join preserves error logging and route middleware", async () => {
  const controller = createStudentClassJoinController({
    pool: { async query() { throw new Error("database unavailable"); } },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
    io: {},
  });
  const response = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await controller.joinClass(
      { user: { id: 7 }, body: { join_code: "ABCDEF" } },
      response
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Sinfga qo'shilish xatosi:", "database unavailable"]]);

  const router = studentClassJoinRoutes({
    pool: {},
    premium: {},
    logAudit() {},
    io: {},
  });
  const route = router.stack[0].route;
  assert.equal(route.path, "/student/join-class");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
  assert.equal(route.stack.length, 3);
});
