const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherResourceDownloadController,
} = require("../src/controllers/teacherResourceDownloadController");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    downloadCall: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    download(path, fileName) {
      this.downloadCall = { path, fileName };
    },
  };
}

test("teacher resource download preserves invalid ID validation", async () => {
  let queryCount = 0;
  const controller = createTeacherResourceDownloadController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    resourceAbsolutePath: () => "unused",
  });
  const res = createResponse();

  await controller.download({ user: { id: 42 }, params: { id: "invalid" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri ID" });
});

test("teacher resource download preserves the not-found query and response", async () => {
  const queries = [];
  const controller = createTeacherResourceDownloadController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
    resourceAbsolutePath: () => "unused",
  });
  const res = createResponse();

  await controller.download({ user: { id: 42 }, params: { id: "10" } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    "SELECT file_path, file_name FROM teacher_resources WHERE id = $1 AND teacher_id = $2"
  );
  assert.deepEqual(queries[0].params, [10, 42]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Resurs topilmadi" });
});

test("teacher resource download preserves counter update, path resolution and download", async () => {
  const queries = [];
  const paths = [];
  const controller = createTeacherResourceDownloadController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (queries.length === 1) {
          return { rows: [{ file_path: "uploads/resources/book.pdf", file_name: "book.pdf" }] };
        }
        return { rowCount: 1 };
      },
    },
    resourceAbsolutePath(filePath) {
      paths.push(filePath);
      return "C:/safe/book.pdf";
    },
  });
  const res = createResponse();

  await controller.download({ user: { id: 42 }, params: { id: "10" } }, res);

  assert.equal(queries.length, 2);
  assert.equal(
    queries[1].sql,
    "UPDATE teacher_resources SET download_count = download_count + 1 WHERE id = $1"
  );
  assert.deepEqual(queries[1].params, [10]);
  assert.deepEqual(paths, ["uploads/resources/book.pdf"]);
  assert.deepEqual(res.downloadCall, { path: "C:/safe/book.pdf", fileName: "book.pdf" });
});

test("teacher resource download preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherResourceDownloadController({
    pool: { async query() { throw new Error("database unavailable"); } },
    resourceAbsolutePath: () => "unused",
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.download({ user: { id: 42 }, params: { id: "10" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Resurs yuklab olish xatosi:", "database unavailable"]]);
});
