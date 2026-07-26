const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherStudentLinkService,
} = require("../src/services/teacherStudentLinkService");

test("teacher student link service preserves query and linked result", async () => {
  const queries = [];
  const service = createTeacherStudentLinkService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [{ "?column?": 1 }] };
      },
    },
  });

  const linked = await service.teacherStudentLinked(42, 7);

  assert.equal(linked, true);
  assert.deepEqual(queries, [{
    sql: `SELECT 1 FROM class_students cs JOIN classes c ON c.id=cs.class_id
     WHERE c.teacher_id=$1 AND cs.student_id=$2 AND cs.status='active'
       AND c.archived_at IS NULL LIMIT 1`,
    params: [42, 7],
  }]);
});

test("teacher student link service preserves unlinked result", async () => {
  const service = createTeacherStudentLinkService({
    pool: { async query() { return { rows: [] }; } },
  });

  assert.equal(await service.teacherStudentLinked(42, 7), false);
});

test("teacher student link service preserves database error propagation", async () => {
  const service = createTeacherStudentLinkService({
    pool: { async query() { throw new Error("database unavailable"); } },
  });

  await assert.rejects(service.teacherStudentLinked(42, 7), /database unavailable/);
});
