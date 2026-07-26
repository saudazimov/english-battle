const test = require("node:test");
const assert = require("node:assert/strict");
const { me } = require("../src/controllers/adminMeController");

test("admin me preserves the existing response", () => {
  const admin = { id: "admin", role: "admin" };
  const response = {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };

  me({ admin }, response);

  assert.deepEqual(response.body, { admin });
});
