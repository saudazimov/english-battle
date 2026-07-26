const test = require("node:test");
const assert = require("node:assert/strict");
const { maskParentPhone } = require("../src/utils/parentPhone");

test("parent phone preserves the existing masked format", () => {
  assert.equal(maskParentPhone("+998 90 123 45 67"), "+998 ** *** ** 67");
  assert.equal(maskParentPhone("1234"), "+123 ** *** ** 34");
});

test("parent phone strips non-digit characters before masking", () => {
  assert.equal(maskParentPhone("+998-(91)-765-43-21"), "+998 ** *** ** 21");
});

test("parent phone preserves empty and short-value handling", () => {
  assert.equal(maskParentPhone(null), "");
  assert.equal(maskParentPhone(undefined), "");
  assert.equal(maskParentPhone(0), "");
  assert.equal(maskParentPhone("123"), "***");
  assert.equal(maskParentPhone("no digits"), "***");
});
