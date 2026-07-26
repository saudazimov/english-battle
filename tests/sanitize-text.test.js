const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeText } = require("../src/utils/sanitizeText");

test("sanitize text preserves angle-bracket removal", () => {
  assert.equal(sanitizeText("<b>Lesson</b> <script>alert</script>"), "bLesson/b scriptalert/script");
});

test("sanitize text preserves quotes, apostrophes and backslashes", () => {
  assert.equal(
    sanitizeText("  \"Past Simple\" and O'zbekcha `title` \\ path  "),
    "\"Past Simple\" and O'zbekcha `title` \\ path"
  );
});

test("sanitize text preserves whitespace and length handling", () => {
  assert.equal(sanitizeText(" one\n\ttwo   three "), "one two three");
  assert.equal(sanitizeText("abcdef", 4), "abcd");
  assert.equal(sanitizeText("abcdef", 0), "abcdef");
});

test("sanitize text preserves nullish and non-string handling", () => {
  assert.equal(sanitizeText(null, 10), null);
  assert.equal(sanitizeText(undefined, 10), undefined);
  assert.equal(sanitizeText(12345, 3), "123");
});
