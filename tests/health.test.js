const test = require("node:test");
const assert = require("node:assert/strict");
const { createHealthController } = require("../src/controllers/healthController");

function createResponse() {
  return {
    statusCode: null,
    body: null,
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

test("health returns the existing status and floored uptime", () => {
  const controller = createHealthController({
    pool: {},
    processRef: { uptime: () => 12.9 },
  });
  const response = createResponse();

  controller.health({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok", uptime: 12 });
});

test("ready returns 200 when the database responds", async () => {
  const queries = [];
  const controller = createHealthController({
    pool: { query: async (sql) => queries.push(sql) },
  });
  const response = createResponse();

  await controller.ready({}, response);

  assert.deepEqual(queries, ["SELECT 1"]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ready" });
});

test("ready returns 503 without exposing database errors", async () => {
  const logged = [];
  const controller = createHealthController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logged.push(args) },
  });
  const response = createResponse();

  await controller.ready({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { status: "not_ready" });
  assert.deepEqual(logged, [["Readiness check DB xatosi:", "database unavailable"]]);
});
