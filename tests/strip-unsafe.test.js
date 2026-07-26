const test = require("node:test");
const assert = require("node:assert/strict");
const { stripUnsafe } = require("../src/utils/stripUnsafe");

test("strip unsafe preserves dangerous-character removal", () => {
  assert.equal(stripUnsafe("<b>\"test\" `value` \\ path</b>"), "btest value path/b");
});

test("strip unsafe preserves whitespace cleanup and apostrophes", () => {
  assert.equal(stripUnsafe("  O'zbekcha\n\tʻmatnʻ   sinov  "), "O'zbekcha ʻmatnʻ sinov");
});

test("strip unsafe preserves length handling", () => {
  assert.equal(stripUnsafe("abcdef", 4), "abcd");
  assert.equal(stripUnsafe("abcdef", 0), "abcdef");
});

test("strip unsafe preserves nullish and non-string handling", () => {
  assert.equal(stripUnsafe(null, 10), null);
  assert.equal(stripUnsafe(undefined, 10), undefined);
  assert.equal(stripUnsafe(12345, 3), "123");
});
