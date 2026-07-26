const test = require("node:test");
const assert = require("node:assert/strict");
const { root } = require("../src/controllers/rootController");

test("root fallback preserves the existing response", () => {
  const response = {
    body: null,
    send(body) {
      this.body = body;
      return this;
    },
  };

  root({}, response);

  assert.equal(response.body, "English Battle serveri ishlayapti!");
});
