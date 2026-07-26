const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminFlagCountController } = require("../src/controllers/adminFlagCountController");

function createResponse() {
  return {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("admin flag count preserves the query and numeric response", async () => {
  const queries = [];
  const controller = createAdminFlagCountController({
    pool: {
      query: async (sql) => {
        queries.push(sql);
        return { rows: [{ c: "7" }] };
      },
    },
  });
  const response = createResponse();

  await controller.count({}, response);

  assert.deepEqual(queries, ["SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'"]);
  assert.deepEqual(response.body, { pending: 7 });
});

test("admin flag count preserves the zero fallback on database errors", async () => {
  const controller = createAdminFlagCountController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
  });
  const response = createResponse();

  await controller.count({}, response);

  assert.deepEqual(response.body, { pending: 0 });
});
