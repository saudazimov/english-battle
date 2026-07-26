const test = require("node:test");
const assert = require("node:assert/strict");
const { createLogoutController } = require("../src/controllers/logoutController");

function createResponse() {
  return {
    statusCode: 200,
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

test("logout increments auth_version and preserves the success response", async () => {
  const queries = [];
  const controller = createLogoutController({
    pool: {
      query: async (sql, params) => queries.push([sql, params]),
    },
  });
  const response = createResponse();

  await controller.logout({ user: { id: 42 } }, response);

  assert.deepEqual(queries, [[
    "UPDATE users SET auth_version = auth_version + 1 WHERE id = $1",
    [42],
  ]]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { message: "Hisobdan chiqildi" });
});

test("logout preserves the existing safe database error response", async () => {
  const logs = [];
  const controller = createLogoutController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.logout({ user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Logout xatosi:", "database unavailable"]]);
});
