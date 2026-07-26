const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherResourceListController,
} = require("../src/controllers/teacherResourceListController");

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

test("teacher resource list preserves query, resources and statistics", async () => {
  const rows = [
    { id: 2, file_type: "pdf", file_size: 100, download_count: 3 },
    { id: 1, file_type: "pdf", file_size: 50, download_count: null },
    { id: 3, file_type: "image", file_size: null, download_count: 2 },
  ];
  const queries = [];
  const controller = createTeacherResourceListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows };
      },
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT r.id, r.title, r.description, r.file_path, r.file_name, r.file_type,
              r.file_size, r.cefr_level, r.skill, r.class_id, r.download_count, r.created_at,
              c.name AS class_name
       FROM teacher_resources r
       LEFT JOIN classes c ON c.id = r.class_id
       WHERE r.teacher_id = $1
       ORDER BY r.created_at DESC`
  );
  assert.deepEqual(queries[0].params, [42]);
  assert.deepEqual(res.body, {
    resources: rows,
    stats: {
      total: 3,
      total_size: 150,
      total_downloads: 5,
      by_type: { pdf: 2, image: 1 },
    },
  });
});

test("teacher resource list preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherResourceListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Resurslar ro'yxati xatosi:", "database unavailable"]]);
});
