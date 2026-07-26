const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createOwnedActiveClassService,
} = require("../src/services/ownedActiveClassService");

test("owned active class service preserves query and first-row result", async () => {
  const queries = [];
  const expectedClass = { id: 42, name: "English A" };
  const service = createOwnedActiveClassService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [expectedClass] };
      },
    },
  });

  const ownedClass = await service.ownedActiveClass(42, 7);

  assert.equal(ownedClass, expectedClass);
  assert.deepEqual(queries, [{
    sql: "SELECT id, name FROM classes WHERE id=$1 AND teacher_id=$2 AND archived_at IS NULL",
    params: [42, 7],
  }]);
});

test("owned active class service preserves missing-class result", async () => {
  const service = createOwnedActiveClassService({
    pool: { async query() { return { rows: [] }; } },
  });

  assert.equal(await service.ownedActiveClass(42, 7), null);
});

test("owned active class service preserves database error propagation", async () => {
  const service = createOwnedActiveClassService({
    pool: { async query() { throw new Error("database unavailable"); } },
  });

  await assert.rejects(service.ownedActiveClass(42, 7), /database unavailable/);
});
