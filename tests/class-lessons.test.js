const test = require("node:test");
const assert = require("node:assert/strict");

const {
  authMiddleware,
  requireStudent,
  requireTeacher,
} = require("../auth");
const {
  createClassLessonController,
} = require("../src/controllers/classLessonController");
const createClassLessonRoutes = require("../src/routes/classLessonRoutes");

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

function createHarness({ queryResults = [], queryError } = {}) {
  const calls = [];
  let queryIndex = 0;
  const dependencies = {
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return queryResults[queryIndex++] || { rows: [] };
      },
    },
    sanitizeText(value, maxLength) {
      calls.push(["sanitize", value, maxLength]);
      return String(value).trim();
    },
    validMeetingUrl(url) {
      calls.push(["validMeetingUrl", url]);
      return true;
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
    controller: createClassLessonController(dependencies),
    dependencies,
  };
}

test("teacher lesson list preserves validation, SQL, and response", async () => {
  const invalidHarness = createHarness();
  const invalidResponse = createResponse();
  await invalidHarness.controller.listTeacherLessons(
    { user: { id: 7 }, params: { classId: "invalid" } },
    invalidResponse
  );
  assert.deepEqual(invalidHarness.calls, []);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri sinf ID" });

  const lessons = [{ id: 1, title: "Lesson" }];
  const harness = createHarness({ queryResults: [{ rows: lessons }] });
  const response = createResponse();
  await harness.controller.listTeacherLessons(
    { user: { id: 7 }, params: { classId: "42abc" } },
    response
  );
  assert.deepEqual(harness.calls, [
    ["ownedActiveClass", 42, 7],
    [
      "query",
      "SELECT id, title, description, meeting_url, status, starts_at, ended_at, created_at FROM class_lessons WHERE class_id=$1 ORDER BY created_at DESC LIMIT 20",
      [42],
    ],
  ]);
  assert.deepEqual(response.body, { lessons });
});

test("teacher lesson start preserves validation order", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.startTeacherLesson(
    {
      user: { id: 7 },
      params: { classId: "invalid" },
      body: { title: " Lesson ", description: " Notes " },
    },
    response
  );

  assert.deepEqual(harness.calls, [
    ["sanitize", " Lesson ", 160],
    ["sanitize", " Notes ", 1000],
  ]);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri sinf ID" });
});

test("teacher lesson start preserves query order, socket event, and response", async () => {
  const lesson = { id: 5, title: "Lesson", status: "live" };
  const harness = createHarness({
    queryResults: [{ rows: [] }, { rows: [lesson] }],
  });
  const response = createResponse();

  await harness.controller.startTeacherLesson(
    {
      user: { id: 7 },
      params: { classId: "42" },
      body: {
        title: " Lesson ",
        description: "   ",
        meeting_url: " https://meet.example/test ",
      },
    },
    response
  );

  assert.deepEqual(harness.calls, [
    ["sanitize", " Lesson ", 160],
    ["sanitize", "   ", 1000],
    ["validMeetingUrl", "https://meet.example/test"],
    ["ownedActiveClass", 42, 7],
    [
      "query",
      "UPDATE class_lessons SET status='finished', ended_at=NOW(), updated_at=NOW() WHERE class_id=$1 AND status='live'",
      [42],
    ],
    [
      "query",
      "INSERT INTO class_lessons (class_id, teacher_id, title, description, meeting_url, status, starts_at) VALUES ($1,$2,$3,$4,$5,'live',NOW()) RETURNING id, title, description, meeting_url, status, starts_at, created_at",
      [42, 7, "Lesson", null, "https://meet.example/test"],
    ],
    ["room", "class_42"],
    ["emit", "classLessonStarted", { classId: 42 }],
  ]);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { lesson });
});

test("teacher lesson finish preserves not-found and success behavior", async () => {
  const missingHarness = createHarness({ queryResults: [{ rows: [] }] });
  const missingResponse = createResponse();
  await missingHarness.controller.finishTeacherLesson(
    { user: { id: 7 }, params: { classId: "42", lessonId: "5" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Faol dars topilmadi" });
  assert.equal(missingHarness.calls.some((call) => call[0] === "emit"), false);

  const harness = createHarness({ queryResults: [{ rows: [{ id: 5 }] }] });
  const response = createResponse();
  await harness.controller.finishTeacherLesson(
    { user: { id: 7 }, params: { classId: "42", lessonId: "5" } },
    response
  );
  assert.deepEqual(harness.calls, [
    ["ownedActiveClass", 42, 7],
    [
      "query",
      "UPDATE class_lessons SET status='finished', ended_at=NOW(), updated_at=NOW() WHERE id=$1 AND class_id=$2 AND teacher_id=$3 AND status='live' RETURNING id",
      [5, 42, 7],
    ],
    ["room", "class_42"],
    ["emit", "classLessonFinished", { classId: 42 }],
  ]);
  assert.deepEqual(response.body, { success: true });
});

test("student live lesson preserves membership, SQL, and null fallback", async () => {
  const harness = createHarness({ queryResults: [{ rows: [] }] });
  const response = createResponse();

  await harness.controller.getStudentLiveLesson(
    { user: { id: 9 }, params: { classId: "42" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["activeClassMembership", 42, 9],
    [
      "query",
      "SELECT id, title, description, meeting_url, status, starts_at FROM class_lessons WHERE class_id=$1 AND status='live' ORDER BY starts_at DESC LIMIT 1",
      [42],
    ],
  ]);
  assert.deepEqual(response.body, { lesson: null });
});

test("class lesson handlers preserve their error logs and responses", async () => {
  const cases = [
    ["listTeacherLessons", "Darslarni yuklash xatosi:", { classId: "42" }],
    ["startTeacherLesson", "Dars boshlash xatosi:", { classId: "42" }],
    [
      "finishTeacherLesson",
      "Darsni tugatish xatosi:",
      { classId: "42", lessonId: "5" },
    ],
    ["getStudentLiveLesson", "Faol dars xatosi:", { classId: "42" }],
  ];

  for (const [method, logMessage, params] of cases) {
    const error = new Error("database failed");
    const harness = createHarness({ queryError: error });
    const response = createResponse();
    await harness.controller[method](
      {
        user: { id: 7 },
        params,
        body: { title: "Lesson", meeting_url: "https://meet.example/test" },
      },
      response
    );
    assert.deepEqual(harness.calls.at(-1), [
      "error",
      logMessage,
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("class lesson routes preserve paths, methods, and middleware order", () => {
  const harness = createHarness();
  const router = createClassLessonRoutes(harness.dependencies);
  const expected = [
    ["/teacher/classes/:classId/lessons", "get", requireTeacher],
    ["/teacher/classes/:classId/lessons", "post", requireTeacher],
    [
      "/teacher/classes/:classId/lessons/:lessonId/finish",
      "post",
      requireTeacher,
    ],
    ["/student/classes/:classId/live-lesson", "get", requireStudent],
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
