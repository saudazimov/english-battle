const test = require("node:test");
const assert = require("node:assert/strict");
const { schoolIdentityKey } = require("../src/utils/schoolIdentity");

test("school identity preserves trimming and separator format", () => {
  assert.equal(
    schoolIdentityKey("  Toshkent  ", " Chilonzor ", " 1-maktab "),
    "Toshkent\x1fChilonzor\x1f1-maktab"
  );
});

test("school identity preserves missing and non-string rejection", () => {
  assert.equal(schoolIdentityKey("Toshkent", "", "1-maktab"), null);
  assert.equal(schoolIdentityKey("Toshkent", "   ", "1-maktab"), null);
  assert.equal(schoolIdentityKey("Toshkent", null, "1-maktab"), null);
  assert.equal(schoolIdentityKey("Toshkent", 12, "1-maktab"), null);
});

test("school identity preserves reserved-separator rejection", () => {
  assert.equal(schoolIdentityKey("Toshkent\x1fCity", "Chilonzor", "1-maktab"), null);
  assert.equal(schoolIdentityKey("Toshkent", "Chilonzor", "1\x1fmaktab"), null);
});
