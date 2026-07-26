const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone } = require("../src/utils/phoneNormalization");

test("phone normalization preserves supported formatting cleanup", () => {
  assert.equal(normalizePhone(" +998 (90) 123-45.67 "), "+998901234567");
  assert.equal(normalizePhone("00998901234567"), "+998901234567");
});

test("phone normalization preserves E.164 length boundaries", () => {
  assert.equal(normalizePhone("+12345678"), "+12345678");
  assert.equal(normalizePhone("+123456789012345"), "+123456789012345");
  assert.equal(normalizePhone("+1234567"), null);
  assert.equal(normalizePhone("+1234567890123456"), null);
});

test("phone normalization preserves invalid-value rejection", () => {
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(998901234567), null);
  assert.equal(normalizePhone("998901234567"), null);
  assert.equal(normalizePhone("+098901234567"), null);
  assert.equal(normalizePhone("+998/90/123/45/67"), null);
  assert.equal(normalizePhone("+998ABC123456"), null);
});
