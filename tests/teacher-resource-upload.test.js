const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  createTeacherResourceUploadController,
} = require("../src/controllers/teacherResourceUploadController");

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

function createController(overrides = {}) {
  return createTeacherResourceUploadController({
    pool: { async query() { return { rows: [] }; } },
    uploadedContentMatches: () => true,
    removeUploadedFile: () => {},
    sanitizeText: (value) => value,
    detectFileType: () => "pdf",
    pathModule: path,
    logAudit: undefined,
    ...overrides,
  });
}

function createRequest(overrides = {}) {
  return {
    user: { id: 42 },
    body: {},
    file: {
      filename: "res_42_1.pdf",
      originalname: "book.pdf",
      mimetype: "application/pdf",
      size: 100,
      path: "uploads/resources/res_42_1.pdf",
    },
    ...overrides,
  };
}

test("teacher resource upload preserves missing and invalid-content responses", async () => {
  const removed = [];
  const missingController = createController();
  const missingRes = createResponse();
  await missingController.upload({ user: { id: 42 }, body: {} }, missingRes);
  assert.equal(missingRes.statusCode, 400);
  assert.deepEqual(missingRes.body, { error: "Fayl yuklanmadi" });

  const file = createRequest().file;
  const invalidController = createController({
    uploadedContentMatches: () => false,
    removeUploadedFile(value) { removed.push(value); },
  });
  const invalidRes = createResponse();
  await invalidController.upload(createRequest({ file }), invalidRes);
  assert.deepEqual(removed, [file]);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, { error: "Fayl tarkibi uning turiga mos emas" });
});

test("teacher resource upload preserves invalid and unowned class cleanup", async () => {
  const removed = [];
  const file = createRequest().file;
  const invalidController = createController({ removeUploadedFile(value) { removed.push(value); } });
  const invalidRes = createResponse();
  await invalidController.upload(createRequest({ body: { class_id: "invalid" }, file }), invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, { error: "Sinf ID noto'g'ri" });

  const queries = [];
  const unownedController = createController({
    pool: { async query(sql, params) { queries.push({ sql, params }); return { rows: [] }; } },
    removeUploadedFile(value) { removed.push(value); },
  });
  const unownedRes = createResponse();
  await unownedController.upload(createRequest({ body: { class_id: "7" }, file }), unownedRes);
  assert.equal(
    queries[0].sql,
    "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL"
  );
  assert.deepEqual(queries[0].params, [7, 42]);
  assert.equal(unownedRes.statusCode, 403);
  assert.deepEqual(unownedRes.body, { error: "Bu sinf sizga tegishli emas" });
  assert.deepEqual(removed, [file, file]);
});

test("teacher resource upload preserves insert fields, sanitization and audit", async () => {
  const queries = [];
  const sanitizeCalls = [];
  const auditCalls = [];
  const req = createRequest({
    body: {
      title: "  <Book>  ",
      description: "<Description>",
      cefr_level: " A2 ",
      skill: " reading ",
      class_id: "7",
    },
    file: {
      ...createRequest().file,
      originalname: "../book\r\n.pdf",
    },
  });
  const controller = createController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (queries.length === 1) return { rows: [{ id: 7 }] };
        return { rows: [{ id: 99, created_at: new Date() }] };
      },
    },
    sanitizeText(value, maxLength) {
      sanitizeCalls.push([value, maxLength]);
      return `clean:${value}`;
    },
    detectFileType(mimetype) {
      assert.equal(mimetype, "application/pdf");
      return "pdf";
    },
    logAudit(...args) { auditCalls.push(args); },
  });
  const res = createResponse();

  await controller.upload(req, res);

  assert.deepEqual(sanitizeCalls, [["<Book>", 200], ["<Description>", 1000]]);
  assert.equal(
    queries[1].sql,
    `INSERT INTO teacher_resources
        (teacher_id, title, description, file_path, file_name, file_type, file_size, cefr_level, skill, class_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at`
  );
  assert.deepEqual(queries[1].params, [
    42,
    "clean:<Book>",
    "clean:<Description>",
    "res_42_1.pdf",
    "book.pdf",
    "pdf",
    100,
    "A2",
    "reading",
    7,
  ]);
  assert.deepEqual(auditCalls, [[req, "resource_uploaded", { entityType: "resource", entityId: 99 }]]);
  assert.deepEqual(res.body, { success: true, id: 99 });
});

test("teacher resource upload preserves file cleanup on database errors", async () => {
  const removed = [];
  const logged = [];
  const file = createRequest().file;
  const controller = createController({
    pool: { async query() { throw new Error("database unavailable"); } },
    removeUploadedFile(value) { removed.push(value); },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.upload(createRequest({ file }), res);

  assert.deepEqual(removed, [file]);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Resurs yuklash xatosi:", "database unavailable"]]);
});
