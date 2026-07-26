const test = require("node:test");
const assert = require("node:assert/strict");

const { clientIp } = require("../src/utils/clientIp");

test("client IP preserves req.ip precedence", () => {
  assert.equal(clientIp({
    ip: "203.0.113.10",
    socket: { remoteAddress: "127.0.0.1" },
  }), "203.0.113.10");
});

test("client IP preserves socket remote-address fallback", () => {
  assert.equal(clientIp({
    socket: { remoteAddress: "::ffff:127.0.0.1" },
  }), "::ffff:127.0.0.1");
  assert.equal(clientIp({
    ip: "",
    socket: { remoteAddress: "10.0.0.5" },
  }), "10.0.0.5");
});

test("client IP preserves unknown fallback", () => {
  assert.equal(clientIp(), "unknown");
  assert.equal(clientIp(null), "unknown");
  assert.equal(clientIp({}), "unknown");
  assert.equal(clientIp({ socket: {} }), "unknown");
});
