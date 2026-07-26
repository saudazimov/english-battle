const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeBase32 } = require("../src/utils/base32");

test("base32 decoder preserves RFC-style values", () => {
  assert.equal(decodeBase32("MY======").toString(), "f");
  assert.equal(decodeBase32("MZXQ====").toString(), "fo");
  assert.equal(decodeBase32("MZXW6===").toString(), "foo");
  assert.equal(decodeBase32("MZXW6YTBOI======").toString(), "foobar");
});

test("base32 decoder preserves lowercase and ignored-character handling", () => {
  assert.equal(decodeBase32("mzxw6 ytb-oi======").toString(), "foobar");
  assert.equal(decodeBase32("***MY***").toString(), "f");
});

test("base32 decoder preserves empty and partial-byte handling", () => {
  assert.deepEqual(decodeBase32(null), Buffer.alloc(0));
  assert.deepEqual(decodeBase32(""), Buffer.alloc(0));
  assert.deepEqual(decodeBase32("A"), Buffer.alloc(0));
  assert.deepEqual(decodeBase32("AA"), Buffer.from([0]));
});
