const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createActiveClassMembershipService,
} = require("../src/services/activeClassMembershipService");

test("active class membership service preserves query and first-row result", async () => {
  const queries = [];
  const expectedMembership = { id: 42, name: "English A", teacher_id: 5 };
  const service = createActiveClassMembershipService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [expectedMembership] };
      },
    },
  });

  const membership = await service.activeClassMembership(42, 7);

  assert.equal(membership, expectedMembership);
  assert.deepEqual(queries, [{
    sql: `SELECT c.id, c.name, c.teacher_id
       FROM class_students cs
       JOIN classes c ON c.id=cs.class_id
      WHERE cs.class_id=$1 AND cs.student_id=$2 AND cs.status='active'
        AND c.archived_at IS NULL`,
    params: [42, 7],
  }]);
});

test("active class membership service preserves missing-membership result", async () => {
  const service = createActiveClassMembershipService({
    pool: { async query() { return { rows: [] }; } },
  });

  assert.equal(await service.activeClassMembership(42, 7), null);
});

test("active class membership service preserves database error propagation", async () => {
  const service = createActiveClassMembershipService({
    pool: { async query() { throw new Error("database unavailable"); } },
  });

  await assert.rejects(service.activeClassMembership(42, 7), /database unavailable/);
});
