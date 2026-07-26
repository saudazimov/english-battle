const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassAnnouncementCreateController,
} = require("../src/controllers/teacherClassAnnouncementCreateController");

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

test("teacher class announcement create sanitizes before invalid-id response", async () => {
  const sanitizeCalls = [];
  let ownershipCalls = 0;
  const controller = createTeacherClassAnnouncementCreateController({
    pool: { async query() { throw new Error("must not query"); } },
    sanitizeText(value, maxLength) {
      sanitizeCalls.push([value, maxLength]);
      return "";
    },
    async ownedActiveClass() { ownershipCalls += 1; return {}; },
    io: createIo([]),
  });
  const res = createResponse();

  await controller.create({ user: { id: 42 }, params: { classId: "invalid" }, body: {} }, res);

  assert.deepEqual(sanitizeCalls, [["", 160], ["", 2000]]);
  assert.equal(ownershipCalls, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri sinf ID" });
});

test("teacher class announcement create preserves required-content response", async () => {
  const controller = createTeacherClassAnnouncementCreateController({
    pool: { async query() { throw new Error("must not query"); } },
    sanitizeText(value) { return value; },
    async ownedActiveClass() { throw new Error("must not check ownership"); },
    io: createIo([]),
  });
  const res = createResponse();

  await controller.create({ user: { id: 42 }, params: { classId: "7" }, body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Sarlavha va e'lon matnini kiriting" });
});

test("teacher class announcement create preserves ownership rejection", async () => {
  const controller = createTeacherClassAnnouncementCreateController({
    pool: { async query() { throw new Error("must not query"); } },
    sanitizeText(value) { return value; },
    async ownedActiveClass(classId, teacherId) {
      assert.deepEqual([classId, teacherId], [7, 42]);
      return null;
    },
    io: createIo([]),
  });
  const res = createResponse();

  await controller.create({
    user: { id: 42 }, params: { classId: "7" }, body: { title: "Title", body: "Body" },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Sinf topilmadi" });
});

test("teacher class announcement create preserves insert, strict pin, socket and response", async () => {
  const announcement = { id: 9, title: "Title", body: "Body", is_pinned: false };
  const queries = [];
  const events = [];
  const controller = createTeacherClassAnnouncementCreateController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [announcement] };
      },
    },
    sanitizeText(value) { return value.trim(); },
    async ownedActiveClass() { return { id: 7 }; },
    io: createIo(events),
  });
  const res = createResponse();

  await controller.create({
    user: { id: 42 },
    params: { classId: "7" },
    body: { title: " Title ", body: " Body ", is_pinned: "true" },
  }, res);

  assert.deepEqual(queries, [{
    sql: `INSERT INTO class_announcements (class_id, teacher_id, title, body, is_pinned)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, title, body, is_pinned, created_at, updated_at`,
    params: [7, 42, "Title", "Body", false],
  }]);
  assert.deepEqual(events, [
    ["to", "class_7"],
    ["emit", "classAnnouncementCreated", { classId: 7 }],
  ]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { announcement });
});

test("teacher class announcement create preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherClassAnnouncementCreateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    sanitizeText(value) { return value; },
    async ownedActiveClass() { return { id: 7 }; },
    io: createIo([]),
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.create({
    user: { id: 42 }, params: { classId: "7" }, body: { title: "Title", body: "Body" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["E'lon yaratish xatosi:", "database unavailable"]]);
});
